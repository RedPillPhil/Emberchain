/**
 * wallet-read-cache — stale-while-revalidate cache for GET /api/wallets/:address.
 *
 * Wallet balance reads hit the same busy chain-node as chain status. After the
 * first fetch, serve cached data instantly and refresh in the background.
 */

import { logger } from "./logger";

const READ_NODE_URL = (process.env["READ_NODE_URL"] ?? process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");

const FRESH_MS = 15_000;
const STALE_MS = 120_000;
/** chain-node can take 15–20 s under mining load; 8 s caused perpetual 503s. */
const FETCH_TIMEOUT_MS = 25_000;

interface CacheEntry {
  data: unknown;
  cachedAt: number;
  refreshing: boolean;
}

const cache = new Map<string, CacheEntry>();

async function fetchWallet(address: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${READ_NODE_URL}/api/wallets/${address}`, {
      signal: ctrl.signal,
      headers: { Connection: "close" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function scheduleRefresh(address: string): void {
  const entry = cache.get(address);
  if (!entry || entry.refreshing) return;
  entry.refreshing = true;
  void fetchWallet(address)
    .then((data) => {
      cache.set(address, { data, cachedAt: Date.now(), refreshing: false });
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ address, err: msg }, "[wallet-read-cache] refresh failed");
      const current = cache.get(address);
      if (current) current.refreshing = false;
    });
}

export async function getWalletCached(address: string): Promise<unknown> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.cachedAt : Infinity;

  if (hit && age < FRESH_MS) return hit.data;

  if (hit && age < STALE_MS) {
    scheduleRefresh(key);
    return hit.data;
  }

  try {
    const data = await fetchWallet(key);
    cache.set(key, { data, cachedAt: Date.now(), refreshing: false });
    return data;
  } catch (err) {
    if (hit) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ address: key, err: msg }, "[wallet-read-cache] fetch failed — serving stale");
      return hit.data;
    }
    throw err;
  }
}
