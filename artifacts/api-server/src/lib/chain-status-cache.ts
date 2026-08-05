/**
 * chain-status-cache — background-polling cache for GET /api/chain/status.
 *
 * chain-node's event loop is saturated by mining share/block traffic, so direct
 * reads can take 20+ seconds even when chain-node's in-process TTL cache is warm.
 * One background poll every POLL_MS serves all dashboard tabs instantly.
 */

import { logger } from "./logger";

const CHAIN_NODE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");

const POLL_MS = 15_000;
const FETCH_TIMEOUT_MS = 8_000;

export interface ChainStatusSnapshot {
  chainName: string;
  symbol: string;
  height: number;
  latestBlockHash: string;
  difficulty: string;
  totalDifficulty: string;
  targetBlockTimeSeconds: number;
  pendingTransactionCount: number;
  isMining: boolean;
  minerAddress: string | null;
  blockReward: string;
  totalSupply: string;
  avgBlockTime?: number | null;
  totalTransactions?: number;
  _cachedAt?: number;
  _stale?: boolean;
}

let snapshot: ChainStatusSnapshot | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchChainStatus(): Promise<ChainStatusSnapshot> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${CHAIN_NODE_URL}/api/chain/status`, {
      signal: ctrl.signal,
      headers: { Connection: "close" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json() as ChainStatusSnapshot;
  } finally {
    clearTimeout(timer);
  }
}

async function poll(): Promise<void> {
  try {
    const fresh = await fetchChainStatus();
    snapshot = { ...fresh, _cachedAt: Date.now(), _stale: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "[chain-status-cache] poll failed — serving stale snapshot");
    if (snapshot) snapshot = { ...snapshot, _stale: true };
  } finally {
    pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
  }
}

export function startChainStatusPoller(): void {
  if (pollTimer !== null) return;
  void poll();
}

export async function getChainStatusCached(): Promise<ChainStatusSnapshot> {
  if (snapshot) return snapshot;
  try {
    const fresh = await fetchChainStatus();
    snapshot = { ...fresh, _cachedAt: Date.now(), _stale: false };
    return snapshot;
  } catch {
    return {
      chainName: "Emberchain",
      symbol: "EMBR",
      height: 0,
      latestBlockHash: "0x0",
      difficulty: "0",
      totalDifficulty: "0",
      targetBlockTimeSeconds: 8,
      pendingTransactionCount: 0,
      isMining: false,
      minerAddress: null,
      blockReward: "5000000000000000000",
      totalSupply: "0",
      avgBlockTime: null,
      _stale: true,
    };
  }
}
