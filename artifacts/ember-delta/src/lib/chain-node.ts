import { chainNodeApi, CHAIN_NODE_URL, resolveChainNodeUrl } from "@/lib/config";
import { normalizeHexAddress } from "@/lib/utils";

export const CHAIN_GAS_PRICE = 1_000_000_000n;

export interface ChainTransaction {
  hash: string;
  status: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same-origin /api on emberchain.org, then direct duckdns if the proxy returns HTML 5xx. */
function chainNodeUrls(path: string): string[] {
  const p = path.startsWith("/") ? path : `/${path}`;
  const primary = chainNodeApi(p);
  const urls = [primary];
  if (resolveChainNodeUrl() === "" && typeof location !== "undefined") {
    const direct = `${CHAIN_NODE_URL}${p}`;
    if (direct !== primary) urls.push(direct);
  }
  return urls;
}

async function fetchChainNodeJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ res: Response; json: T }> {
  const urls = chainNodeUrls(path);
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)]!;
    try {
      const res = await fetch(url, init);
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const snippet = ct.includes("text/html")
          ? " (Netlify proxy error — retrying direct node)"
          : "";
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < maxAttempts - 1) {
          lastError = new Error(`Expected JSON from chain node (HTTP ${res.status})${snippet}`);
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(`Expected JSON from chain node (HTTP ${res.status})${snippet}`);
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

export async function submitChainTransaction(input: {
  fromPrivateKey: string;
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
}): Promise<ChainTransaction> {
  const body = {
    fromPrivateKey: input.fromPrivateKey,
    to: normalizeHexAddress(input.to) ?? input.to,
    value: input.value,
    data: input.data ?? "0x",
    gasLimit: input.gasLimit ?? "3000000",
  };
  const { json } = await fetchChainNodeJson<ChainTransaction>(
    "/api/transactions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return json;
}

export async function getChainTransaction(hash: string): Promise<ChainTransaction | undefined> {
  const path = `/api/transactions/${encodeURIComponent(hash)}`;
  const urls = chainNodeUrls(path);
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const url = urls[Math.min(attempt, urls.length - 1)]!;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
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
      return json as ChainTransaction;
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
): Promise<ChainTransaction> {
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

export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}
