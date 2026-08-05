/**
 * Launch bridge relayer — verifies native escrow deposits and mints wrapped
 * tokens on Base via UniversalBridge.bridgeIn.
 */

import { createHash, randomUUID } from "crypto";
import { ethers } from "ethers";
import { logger } from "./logger";
import { getBaseProvider } from "./base-provider";
import { type TokenLaunch } from "./launch-db";
import { verifyLaunchDeposit } from "./launch-deposit-verifier";
import {
  createLaunchDeposit,
  getDepositByNativeTx,
  updateLaunchDeposit,
} from "./launch-deposit-db";

const UNIVERSAL_BRIDGE_ABI = [
  "function bridgeIn(address token, address recipient, uint256 grossAmount, uint256 nonce) external",
];

/** Parse human decimal or raw integer string into smallest-unit bigint. */
export function parseBridgeAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Amount required");
  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  const [whole, frac = ""] = trimmed.split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error("Invalid amount — use a decimal number or raw integer");
  }
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

function getRelayerWallet(provider: ethers.JsonRpcProvider): ethers.Wallet | null {
  const key = process.env["BRIDGE_RELAYER_PRIVATE_KEY"];
  if (!key) return null;
  return new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key, provider);
}

async function mintWrappedOnBase(
  launch: TokenLaunch,
  depositId: string,
  amount: bigint,
  baseRecipient: string,
  nativeTxHash: string,
): Promise<string> {
  const baseProvider = getBaseProvider();
  if (!baseProvider) throw new Error("BASE_RPC_URL not configured");

  const relayer = getRelayerWallet(baseProvider);
  if (!relayer) throw new Error("BRIDGE_RELAYER_PRIVATE_KEY not configured");

  const bridgeAddr = launch.universal_bridge_address ?? process.env["UNIVERSAL_BRIDGE_ADDRESS"] ?? "";
  if (!bridgeAddr) throw new Error("UniversalBridge address not configured");

  if (!launch.wrapped_token_address) {
    throw new Error("Wrapped token not deployed on Base");
  }

  const bridge = new ethers.Contract(bridgeAddr, UNIVERSAL_BRIDGE_ABI, relayer);
  const nonce = BigInt(
    "0x" +
      createHash("sha256")
        .update(`${launch.id}:${nativeTxHash.toLowerCase()}`)
        .digest("hex")
        .slice(0, 16),
  );

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

    return receipt.hash;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateLaunchDeposit(depositId, { status: "failed", error_msg: msg });
    throw err;
  }
}

export async function processLaunchBridgeClaim(
  launch: TokenLaunch,
  nativeTxHash: string,
  baseRecipient: string,
): Promise<{ depositId: string; bridgeInTxHash?: string }> {
  if (launch.status !== "live") {
    throw new Error("Token is not live yet — wait for launch to complete");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) {
    throw new Error("Invalid Base recipient address");
  }

  const normalizedTx = nativeTxHash.trim();
  const existing = await getDepositByNativeTx(normalizedTx);
  if (existing?.status === "minted") {
    return { depositId: existing.id, bridgeInTxHash: existing.bridge_in_tx_hash };
  }
  if (existing?.status === "pending") {
    throw new Error("This deposit is already being processed — retry in a minute");
  }

  const { from, amount } = await verifyLaunchDeposit(launch, normalizedTx);
  if (amount <= 0n) throw new Error("Deposit amount must be greater than zero");

  const depositId = existing?.id ?? randomUUID();
  if (!existing) {
    await createLaunchDeposit({
      id: depositId,
      launch_id: launch.id,
      native_tx_hash: normalizedTx,
      native_from: from,
      gross_amount: amount.toString(),
      base_recipient: baseRecipient.toLowerCase(),
    });
  } else if (existing.status === "failed") {
    await updateLaunchDeposit(depositId, {
      status: "pending",
      error_msg: null,
      base_recipient: baseRecipient.toLowerCase(),
    });
  }

  const bridgeInTxHash = await mintWrappedOnBase(
    launch,
    depositId,
    amount,
    baseRecipient,
    normalizedTx,
  );

  return { depositId, bridgeInTxHash };
}

/** All chain types — verification routed by launch chain config. */
export async function processLaunchBridgeClaimGeneric(
  launch: TokenLaunch,
  nativeTxHash: string,
  baseRecipient: string,
): Promise<{ depositId: string; bridgeInTxHash?: string }> {
  return processLaunchBridgeClaim(launch, nativeTxHash, baseRecipient);
}

/** Operator mint — skips on-chain deposit verification (Monero, custom UTXO, etc.). */
export async function processLaunchBridgeClaimManual(
  launch: TokenLaunch,
  params: {
    nativeTxHash: string;
    baseRecipient: string;
    grossAmount: bigint;
    nativeFrom?: string;
    adminNotes?: string;
  },
): Promise<{ depositId: string; bridgeInTxHash?: string }> {
  if (launch.status !== "live") {
    throw new Error("Token is not live yet — finish escrow setup first");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.baseRecipient)) {
    throw new Error("Invalid Base recipient address");
  }
  if (params.grossAmount <= 0n) {
    throw new Error("Mint amount must be greater than zero");
  }
  if (!launch.bridge_wallet_address && !launch.native_bridge_address) {
    throw new Error("Escrow address not configured for this launch");
  }

  const normalizedTx = params.nativeTxHash.trim();
  if (!normalizedTx) throw new Error("Native transaction id required");

  const existing = await getDepositByNativeTx(normalizedTx);
  if (existing?.status === "minted") {
    return { depositId: existing.id, bridgeInTxHash: existing.bridge_in_tx_hash };
  }
  if (existing?.status === "pending") {
    throw new Error("This deposit is already being processed — retry in a minute");
  }

  const depositId = existing?.id ?? randomUUID();
  if (!existing) {
    await createLaunchDeposit({
      id: depositId,
      launch_id: launch.id,
      native_tx_hash: normalizedTx,
      native_from: params.nativeFrom,
      gross_amount: params.grossAmount.toString(),
      base_recipient: params.baseRecipient.toLowerCase(),
      manual_claim: true,
      admin_notes: params.adminNotes,
    });
  } else if (existing.status === "failed") {
    await updateLaunchDeposit(depositId, {
      status: "pending",
      error_msg: null,
      base_recipient: params.baseRecipient.toLowerCase(),
      gross_amount: params.grossAmount.toString(),
      native_from: params.nativeFrom?.toLowerCase() ?? null,
      admin_notes: params.adminNotes ?? existing.admin_notes,
    });
  }

  const bridgeInTxHash = await mintWrappedOnBase(
    launch,
    depositId,
    params.grossAmount,
    params.baseRecipient,
    normalizedTx,
  );

  logger.info(
    {
      launchId: launch.id,
      nativeTxHash: normalizedTx,
      amount: params.grossAmount.toString(),
      manual: true,
    },
    "[launch-bridge-relayer] manual bridgeIn complete",
  );

  return { depositId, bridgeInTxHash };
}
