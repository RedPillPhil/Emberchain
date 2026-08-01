import { CHAIN_NODE_URL } from "@/lib/config";

export { CHAIN_NODE_URL };

export const CHAIN_GAS_PRICE = 1_000_000_000n;

export interface ChainTransaction {
  hash: string;
  status: string;
}

export async function submitChainTransaction(input: {
  fromPrivateKey: string;
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
}): Promise<ChainTransaction> {
  const res = await fetch(`${CHAIN_NODE_URL}/api/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON from chain node (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as ChainTransaction;
}

export async function getChainTransaction(hash: string): Promise<ChainTransaction | undefined> {
  const res = await fetch(`${CHAIN_NODE_URL}/api/transactions/${encodeURIComponent(hash)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return undefined;
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as ChainTransaction;
}

export async function waitForChainTransaction(
  hash: string,
  timeoutMs = 90_000,
  pollMs = 2_000,
): Promise<ChainTransaction> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await getChainTransaction(hash);
    if (tx && tx.status !== "pending") return tx;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Transaction ${hash} was not confirmed within ${timeoutMs / 1000}s`);
}

export function maxSpendableEmbr(balanceWei: bigint, gasLimit: bigint | string): bigint {
  const gasReserve = BigInt(gasLimit) * CHAIN_GAS_PRICE;
  return balanceWei > gasReserve ? balanceWei - gasReserve : 0n;
}
