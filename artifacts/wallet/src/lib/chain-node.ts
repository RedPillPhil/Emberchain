import type { Transaction, TransactionInput } from "@workspace/api-client-react";
import { chainNodeApi, CHAIN_NODE_URL } from "@/lib/config";

export { CHAIN_NODE_URL };

/** 1 gwei — matches lib/chain-core GAS_PRICE */
export const CHAIN_GAS_PRICE = 1_000_000_000n;

export async function submitChainTransaction(
  input: TransactionInput,
): Promise<Transaction> {
  const res = await fetch(chainNodeApi("/api/transactions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as Transaction;
}

export async function getChainTransaction(hash: string): Promise<Transaction | undefined> {
  const res = await fetch(chainNodeApi(`/api/transactions/${encodeURIComponent(hash)}`), {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  return json as Transaction;
}

export async function waitForChainTransaction(
  hash: string,
  timeoutMs = 90_000,
  pollMs = 2_000,
): Promise<Transaction> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await getChainTransaction(hash);
    if (tx && tx.status !== "pending") return tx;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Transaction ${hash} was not confirmed within ${timeoutMs / 1000}s`);
}

/** Max EMBR send/bridge amount after reserving gas for a given gas limit. */
export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}
