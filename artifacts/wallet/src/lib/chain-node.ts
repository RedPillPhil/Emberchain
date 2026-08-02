import type { Transaction, TransactionInput } from "@workspace/api-client-react";
import { chainNodeApi } from "@/lib/config";
import { normalizeHexAddress } from "@/lib/utils";

/** 1 gwei — matches lib/chain-core GAS_PRICE */
export const CHAIN_GAS_PRICE = 1_000_000_000n;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChainNodeJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ res: Response; json: T }> {
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
      }
      const json = (await res.json()) as T;
      if (!res.ok) {
        const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`;
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < maxAttempts - 1) {
          lastError = new Error(msg);
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(msg);
      }
      return { res, json };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        lastError.name === "TypeError" ||
        lastError.message.includes("Failed to fetch") ||
        lastError.message.includes("Expected JSON from chain node (HTTP 5");
      if (retryable && attempt < maxAttempts - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("Chain node request failed");
}

export async function submitChainTransaction(
  input: TransactionInput,
): Promise<Transaction> {
  const body: TransactionInput = {
    ...input,
    to: input.to ? normalizeHexAddress(input.to) : null,
  };
  const { json } = await fetchChainNodeJson<Transaction>(
    chainNodeApi("/api/transactions"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return json;
}

export async function getChainTransaction(hash: string): Promise<Transaction | undefined> {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(chainNodeApi(`/api/transactions/${encodeURIComponent(hash)}`), {
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return undefined;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts - 1) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
      }
      const json = await res.json();
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts - 1) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      return json as Transaction;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retryable =
        e.name === "TypeError" ||
        e.message.includes("Failed to fetch") ||
        e.message.includes("Expected JSON from chain node (HTTP 5");
      if (retryable && attempt < maxAttempts - 1) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  return undefined;
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

/** Drop a stuck pending tx from the mempool (marks it failed; safe to resubmit). */
export async function dropChainTransaction(hash: string): Promise<Transaction> {
  const { json } = await fetchChainNodeJson<Transaction>(
    chainNodeApi(`/api/transactions/${encodeURIComponent(hash)}/drop`),
    { method: "POST", headers: { Accept: "application/json" } },
  );
  return json;
}

export interface MiningStatus {
  isMining: boolean;
  minerAddress: string | null;
  hashRate: number;
  intensity: number;
}

/** Ask the chain-node to start its built-in CPU miner (helps confirm mempool txs). */
export async function startChainNodeMining(
  minerAddress: string,
  intensity = 1,
): Promise<MiningStatus> {
  const { json } = await fetchChainNodeJson<MiningStatus>(
    chainNodeApi("/api/mining/start"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minerAddress, intensity }),
    },
  );
  return json;
}

export async function getChainNodeMiningStatus(): Promise<MiningStatus> {
  const { json } = await fetchChainNodeJson<MiningStatus>(
    chainNodeApi("/api/mining/status"),
  );
  return json;
}

/** Max EMBR send/bridge amount after reserving gas for a given gas limit. */
export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}
