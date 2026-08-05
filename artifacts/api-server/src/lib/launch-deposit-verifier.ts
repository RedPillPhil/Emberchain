/**
 * Verify native-chain deposits to per-launch escrow addresses.
 * Used by launch-bridge-relayer before minting on Base.
 */

import { ethers } from "ethers";
import type { TokenLaunch } from "./launch-db";

export interface VerifiedLaunchDeposit {
  from: string;
  amount: bigint;
}

function escrowAddress(launch: TokenLaunch): string {
  const addr = launch.bridge_wallet_address ?? launch.native_bridge_address;
  if (!addr) throw new Error("Escrow address not assigned for this launch");
  return addr;
}

function requiredConfirmations(launch: TokenLaunch): number {
  return launch.confirmations_req ?? 6;
}

async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 404) throw new Error("Transaction not found on chain explorer");
  if (!res.ok) throw new Error(`Explorer HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// ── EVM (native coin transfer) ────────────────────────────────────────────────

async function verifyEvmDeposit(
  launch: TokenLaunch,
  nativeTxHash: string,
): Promise<VerifiedLaunchDeposit> {
  if (!launch.rpc_url) throw new Error("Launch RPC URL not configured");

  const provider = new ethers.JsonRpcProvider(launch.rpc_url);
  const receipt = await provider.getTransactionReceipt(nativeTxHash);
  if (!receipt) throw new Error("Native transaction not found — wait for confirmations and retry");
  if (receipt.status !== 1) throw new Error("Native transaction failed on-chain");

  const tx = await provider.getTransaction(nativeTxHash);
  if (!tx) throw new Error("Could not load native transaction");

  const escrow = escrowAddress(launch).toLowerCase();
  if (!tx.to || tx.to.toLowerCase() !== escrow) {
    throw new Error("Transaction was not sent to this token's escrow bridge address");
  }
  if (tx.value <= 0n) throw new Error("Transaction did not transfer native coin");

  const latest = await provider.getBlockNumber();
  const conf = latest - receipt.blockNumber + 1;
  const required = requiredConfirmations(launch);
  if (conf < required) {
    throw new Error(`Waiting for confirmations (${conf}/${required}) — retry shortly`);
  }

  return { from: receipt.from.toLowerCase(), amount: tx.value };
}

// ── UTXO (Blockstream-style API) ─────────────────────────────────────────────

type BlockstreamTx = {
  status: { confirmed: boolean; block_height?: number };
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
};

async function verifyBlockstreamStyleUtxo(
  apiBase: string,
  nativeTxHash: string,
  escrow: string,
  requiredConf: number,
): Promise<VerifiedLaunchDeposit> {
  const tx = await fetchJson<BlockstreamTx>(`${apiBase.replace(/\/$/, "")}/tx/${nativeTxHash}`);

  let total = 0n;
  for (const out of tx.vout ?? []) {
    if (out.scriptpubkey_address === escrow) {
      total += BigInt(out.value);
    }
  }
  if (total <= 0n) {
    throw new Error(`No output to escrow address ${escrow} in this transaction`);
  }
  if (!tx.status.confirmed) {
    throw new Error("Transaction not yet confirmed on native chain");
  }

  const tip = await fetchJson<number>(`${apiBase.replace(/\/$/, "")}/blocks/tip/height`, 10_000);
  const conf = tx.status.block_height ? tip - tx.status.block_height + 1 : 0;
  if (conf < requiredConf) {
    throw new Error(`Waiting for confirmations (${conf}/${requiredConf}) — retry shortly`);
  }

  return { from: "unknown", amount: total };
}

function blockstreamApiForNetwork(utxoNetwork: string): string | null {
  switch (utxoNetwork) {
    case "bitcoin":
      return "https://blockstream.info/api";
    case "litecoin":
      return "https://litecoinspace.org/api";
    default:
      return null;
  }
}

// ── UTXO (BlockCypher API) ────────────────────────────────────────────────────

type BlockCypherTx = {
  confirmations?: number;
  outputs?: Array<{ addresses?: string[]; value: number }>;
};

async function verifyBlockCypherUtxo(
  chainSlug: string,
  nativeTxHash: string,
  escrow: string,
  requiredConf: number,
): Promise<VerifiedLaunchDeposit> {
  const tx = await fetchJson<BlockCypherTx>(
    `https://api.blockcypher.com/v1/${chainSlug}/main/txs/${nativeTxHash}`,
  );

  let total = 0n;
  for (const out of tx.outputs ?? []) {
    if (out.addresses?.includes(escrow)) {
      total += BigInt(out.value);
    }
  }
  if (total <= 0n) {
    throw new Error(`No output to escrow address ${escrow} in this transaction`);
  }

  const conf = tx.confirmations ?? 0;
  if (conf < requiredConf) {
    throw new Error(`Waiting for confirmations (${conf}/${requiredConf}) — retry shortly`);
  }

  return { from: "unknown", amount: total };
}

function blockCypherChain(utxoNetwork: string): string | null {
  switch (utxoNetwork) {
    case "dogecoin":
      return "doge";
    case "dash":
      return "dash";
    case "zcash":
      return "zec";
    default:
      return null;
  }
}

async function verifyUtxoDeposit(
  launch: TokenLaunch,
  nativeTxHash: string,
): Promise<VerifiedLaunchDeposit> {
  const escrow = escrowAddress(launch);
  const required = requiredConfirmations(launch);
  const network = launch.utxo_network ?? "bitcoin";

  const blockstream = blockstreamApiForNetwork(network);
  if (blockstream) {
    return verifyBlockstreamStyleUtxo(blockstream, nativeTxHash, escrow, required);
  }

  const blockcypher = blockCypherChain(network);
  if (blockcypher) {
    return verifyBlockCypherUtxo(blockcypher, nativeTxHash, escrow, required);
  }

  // Custom explorer: user may provide Blockstream-compatible API base URL
  if (launch.explorer_url) {
    const base = launch.explorer_url.replace(/\/$/, "");
    if (base.includes("blockstream") || base.includes("litecoinspace") || base.endsWith("/api")) {
      return verifyBlockstreamStyleUtxo(base, nativeTxHash, escrow, required);
    }
  }

  // Bitcoin-format fallback for "other" UTXO chains
  if (network === "other") {
    return verifyBlockstreamStyleUtxo(
      "https://blockstream.info/api",
      nativeTxHash,
      escrow,
      required,
    );
  }

  throw new Error(
    `Cannot verify ${network} deposits automatically — set a Blockstream-compatible explorer URL in your launch config`,
  );
}

// ── Solana / ed25519 base58 ───────────────────────────────────────────────────

type SolTx = {
  meta: { preBalances: number[]; postBalances: number[]; err: unknown } | null;
  transaction: { message: { accountKeys: string[] } };
};

async function verifySolanaDeposit(
  launch: TokenLaunch,
  nativeTxHash: string,
): Promise<VerifiedLaunchDeposit> {
  const escrow = escrowAddress(launch);
  const rpc = launch.rpc_url?.trim() || "https://api.mainnet-beta.solana.com";

  const rpcRes = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [nativeTxHash, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await rpcRes.json()) as { result: SolTx | null; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  if (!data.result?.meta) {
    throw new Error("Solana transaction not found or not finalized yet");
  }
  if (data.result.meta.err) throw new Error("Solana transaction failed on-chain");

  const keys = data.result.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k === escrow);
  if (idx === -1) {
    throw new Error(`Escrow address ${escrow} is not an account in this Solana transaction`);
  }

  const lamports =
    (data.result.meta.postBalances[idx] ?? 0) - (data.result.meta.preBalances[idx] ?? 0);
  if (lamports <= 0) {
    throw new Error("Transaction did not increase escrow balance");
  }

  return { from: "unknown", amount: BigInt(lamports) };
}

// ── Public entry ──────────────────────────────────────────────────────────────

export async function verifyLaunchDeposit(
  launch: TokenLaunch,
  nativeTxHash: string,
): Promise<VerifiedLaunchDeposit> {
  const txHash = nativeTxHash.trim();
  if (!txHash) throw new Error("Transaction hash required");

  const chainType = launch.chain_type?.toLowerCase() ?? "";
  const format = launch.address_format?.toLowerCase() ?? "";
  const crypto = launch.cryptography?.toLowerCase() ?? "";

  if (chainType === "evm" || format === "hex") {
    return verifyEvmDeposit(launch, txHash);
  }

  if (crypto === "ed25519" && format === "base58") {
    return verifySolanaDeposit(launch, txHash);
  }

  if (crypto === "secp256k1" && (format === "base58" || format === "bech32")) {
    return verifyUtxoDeposit(launch, txHash);
  }

  throw new Error(
    "Unsupported chain configuration for automatic verification — contact support with your tx hash",
  );
}
