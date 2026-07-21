/** All API calls go to the locally-running Emberchain node. */
export const NODE_URL = "http://localhost:8545";

export async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${NODE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${NODE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── API types ────────────────────────────────────────────────────────────────

export interface Wallet {
  address: string;
  balance: string;
  nonce: number;
  label?: string;
}

export interface ChainStatus {
  height: number;
  difficulty: string;
  totalSupply: string;
  pendingTransactionCount: number;
  avgBlockTime: number | null;
  isMining: boolean;
  chainId: number;
  network: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number | null;
  timestamp: string | null;
  status: "pending" | "confirmed" | "failed";
}

export interface Block {
  number: number;
  hash: string;
  miner: string;
  timestamp: string;
  transactionCount: number;
  difficulty: string;
}

export interface MiningStatus {
  isMining: boolean;
  hashRate: number | null;
  blocksMinedThisSession: number;
  minerAddress: string | null;
}

// ── API calls ────────────────────────────────────────────────────────────────

export const api = {
  wallets: () => fetchJSON<Wallet[]>("/api/wallets"),
  wallet: (address: string) => fetchJSON<Wallet>(`/api/wallets/${address}`),
  chainStatus: () => fetchJSON<ChainStatus>("/api/chain/status"),
  transactions: (address?: string) =>
    fetchJSON<Transaction[]>(
      address ? `/api/transactions?address=${address}` : "/api/transactions"
    ),
  miningStatus: () => fetchJSON<MiningStatus>("/api/mining/status"),
  startMining: (address: string) =>
    postJSON<{ ok: boolean }>("/api/mining/start", { minerAddress: address }),
  stopMining: () => postJSON<{ ok: boolean }>("/api/mining/stop", {}),
  send: (from: string, to: string, value: string, privateKey: string) =>
    postJSON<{ hash: string }>("/api/transactions", { from, to, value, privateKey }),
};
