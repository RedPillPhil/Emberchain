import type { Transaction, TransactionInput } from "@workspace/api-client-react";
import { chainNodeApi } from "@/lib/config";
import { normalizeHexAddress } from "@/lib/utils";

/** 1 gwei — matches lib/chain-core GAS_PRICE */
export const CHAIN_GAS_PRICE = 1_000_000_000n;

export async function submitChainTransaction(
  input: TransactionInput,
): Promise<Transaction> {
  const body: TransactionInput = {
    ...input,
    to: input.to ? normalizeHexAddress(input.to) : null,
  };
  const res = await fetch(chainNodeApi("/api/transactions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    if (tx && tx.status !== "pending") {
      if (tx.status === "failed") {
        throw new Error(tx.error ?? "Transaction failed on-chain");
      }
      return tx;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Transaction ${hash} was not confirmed within ${timeoutMs / 1000}s`);
}

/** Max EMBR send/bridge amount after reserving gas for a given gas limit. */
export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}
