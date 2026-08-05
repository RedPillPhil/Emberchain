/**
 * Launch bridge relayer — verifies native escrow deposits and mints wrapped
 * tokens on Base via UniversalBridge.bridgeIn.
 */

import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { logger } from "./logger";
import { getBaseProvider } from "./base-provider";
import { type TokenLaunch } from "./launch-db";
import {
  createLaunchDeposit,
  getDepositByNativeTx,
  updateLaunchDeposit,
} from "./launch-deposit-db";

const UNIVERSAL_BRIDGE_ABI = [
  "function bridgeIn(address token, address recipient, uint256 grossAmount, uint256 nonce) external",
];

function getRelayerWallet(provider: ethers.JsonRpcProvider): ethers.Wallet | null {
  const key = process.env["BRIDGE_RELAYER_PRIVATE_KEY"];
  if (!key) return null;
  return new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key, provider);
}

async function verifyEvmDeposit(
  launch: TokenLaunch,
  nativeTxHash: string,
): Promise<{ from: string; amount: bigint }> {
  if (!launch.rpc_url) throw new Error("Launch RPC URL not configured");
  if (!launch.bridge_wallet_address) throw new Error("Escrow address not assigned");

  const provider = new ethers.JsonRpcProvider(launch.rpc_url);
  const receipt = await provider.getTransactionReceipt(nativeTxHash);
  if (!receipt) throw new Error("Native transaction not found — wait for confirmations and retry");
  if (receipt.status !== 1) throw new Error("Native transaction failed on-chain");

  const tx = await provider.getTransaction(nativeTxHash);
  if (!tx) throw new Error("Could not load native transaction");

  const escrow = launch.bridge_wallet_address.toLowerCase();
  if (!tx.to || tx.to.toLowerCase() !== escrow) {
    throw new Error("Transaction was not sent to this token's escrow bridge address");
  }

  if (tx.value <= 0n) throw new Error("Transaction did not transfer native coin");

  const requiredConf = launch.confirmations_req ?? 6;
  const latest = await provider.getBlockNumber();
  const conf = latest - receipt.blockNumber + 1;
  if (conf < requiredConf) {
    throw new Error(`Waiting for confirmations (${conf}/${requiredConf}) — retry shortly`);
  }

  return { from: receipt.from.toLowerCase(), amount: tx.value };
}

export async function processLaunchBridgeClaim(
  launch: TokenLaunch,
  nativeTxHash: string,
  baseRecipient: string,
): Promise<{ depositId: string; bridgeInTxHash?: string }> {
  if (launch.status !== "live") {
    throw new Error("Token is not live yet — wait for launch to complete");
  }
  if (!launch.wrapped_token_address) {
    throw new Error("Wrapped token not deployed on Base");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) {
    throw new Error("Invalid Base recipient address");
  }

  const existing = await getDepositByNativeTx(nativeTxHash);
  if (existing?.status === "minted") {
    return { depositId: existing.id, bridgeInTxHash: existing.bridge_in_tx_hash };
  }
  if (existing?.status === "pending") {
    throw new Error("This deposit is already being processed");
  }

  const { from, amount } = await verifyEvmDeposit(launch, nativeTxHash);

  const depositId = existing?.id ?? randomUUID();
  if (!existing) {
    await createLaunchDeposit({
      id: depositId,
      launch_id: launch.id,
      native_tx_hash: nativeTxHash,
      native_from: from,
      gross_amount: amount.toString(),
      base_recipient: baseRecipient,
    });
  }

  const baseProvider = getBaseProvider();
  if (!baseProvider) throw new Error("BASE_RPC_URL not configured");

  const relayer = getRelayerWallet(baseProvider);
  if (!relayer) throw new Error("BRIDGE_RELAYER_PRIVATE_KEY not configured");

  const bridgeAddr = launch.universal_bridge_address ?? process.env["UNIVERSAL_BRIDGE_ADDRESS"] ?? "";
  if (!bridgeAddr) throw new Error("UniversalBridge address not configured");

  const bridge = new ethers.Contract(bridgeAddr, UNIVERSAL_BRIDGE_ABI, relayer);
  const nonce = BigInt(Date.now());

  try {
    const tx = await bridge.bridgeIn(
      launch.wrapped_token_address,
      baseRecipient,
      amount,
      nonce,
    );
    const receipt = await tx.wait(1);

    await updateLaunchDeposit(depositId, {
      status: "minted",
      bridge_in_tx_hash: receipt.hash,
      bridge_in_nonce: nonce.toString(),
    });

    logger.info(
      {
        launchId: launch.id,
        nativeTxHash,
        baseRecipient,
        amount: amount.toString(),
        bridgeInTx: receipt.hash,
      },
      "[launch-bridge-relayer] bridgeIn complete",
    );

    return { depositId, bridgeInTxHash: receipt.hash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateLaunchDeposit(depositId, { status: "failed", error_msg: msg });
    throw err;
  }
}

/** Non-EVM / UTXO: verify via explorer or manual queue — MVP returns helpful error. */
export async function processLaunchBridgeClaimGeneric(
  launch: TokenLaunch,
  nativeTxHash: string,
  baseRecipient: string,
): Promise<{ depositId: string; bridgeInTxHash?: string }> {
  if (launch.chain_type === "evm" || launch.address_format === "hex") {
    return processLaunchBridgeClaim(launch, nativeTxHash, baseRecipient);
  }

  throw new Error(
    "Automatic minting for this chain type is coming soon. Contact support with your native tx hash and Base address.",
  );
}
