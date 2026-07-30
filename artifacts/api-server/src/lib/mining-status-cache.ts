/**
 * mining-status-cache — background-polling cache for /api/mining/status.
 *
 * Why this exists:
 *   The mining node (READ_NODE_URL / duckdns) is under constant load from
 *   browser miners submitting shares and templates.  Proxying every
 *   /api/mining/status browser-tab request directly to that node adds
 *   per-request HTTP round-trips that it can't keep up with, so queries
 *   time out and the dashboard shows 0 active miners.
 *
 *   Instead: one background interval polls the mining node every POLL_MS.
 *   All browser requests are served from the in-memory snapshot — instant,
 *   and zero additional load on the mining node.
 *
 * Behaviour:
 *   - First call before the first poll completes: falls through to a direct
 *     fetch so the very first page load isn't blank.
 *   - If the mining node is unreachable: last good snapshot is served (stale
 *     flag set) so the UI shows the last-known miner count rather than 0.
 *   - Poll failures are logged as warnings, not errors.
 */

import { logger } from "./logger";

// Mining status must come from the main chain-node (CHAIN_NODE_URL / localhost:8082),
// NOT the read replica.  Miners submit shares and templates to the main node, so
// only it holds the live activeMiners / sharesInRound data.
const READ_NODE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");

const POLL_MS = 15_000;  // refresh every 15 s — one request per interval regardless of tab count
const FETCH_TIMEOUT_MS = 8_000;

export interface MiningStatusSnapshot {
  isMining: boolean;
  minerAddress: string | null;
  difficulty: string;
  blocksMined: number;
  hashRate: number;
  blockReward: string;
  activeMiners: number;
  sharesInRound: Record<string, number>;
  _cachedAt?: number;
  _stale?: boolean;
}

let snapshot: MiningStatusSnapshot | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchMiningStatus(): Promise<MiningStatusSnapshot> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${READ_NODE_URL}/api/mining/status`, {
      signal: ctrl.signal,
      headers: { "Connection": "close" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json() as MiningStatusSnapshot;
  } finally {
    clearTimeout(timer);
  }
}

async function poll(): Promise<void> {
  try {
    const fresh = await fetchMiningStatus();
    snapshot = { ...fresh, _cachedAt: Date.now(), _stale: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "[mining-status-cache] poll failed — serving stale snapshot");
    if (snapshot) snapshot = { ...snapshot, _stale: true };
  } finally {
    // Schedule next poll — using setTimeout instead of setInterval so a slow
    // request never causes overlapping polls.
    pollTimer = setTimeout(() => { void poll(); }, POLL_MS);
  }
}

/** Start the background polling loop.  Call once at server startup. */
export function startMiningStatusPoller(): void {
  if (pollTimer !== null) return; // already running
  // Kick off immediately so the first request has data quickly.
  void poll();
}

/**
 * Return the current cached mining status.
 * If no snapshot exists yet (server just started), does a one-shot live fetch
 * so the very first request isn't blank while the poller warms up.
 */
export async function getMiningStatusCached(): Promise<MiningStatusSnapshot> {
  if (snapshot) return snapshot;
  // Cold start — fetch once synchronously so the caller gets real data.
  try {
    const fresh = await fetchMiningStatus();
    snapshot = { ...fresh, _cachedAt: Date.now(), _stale: false };
    return snapshot;
  } catch {
    // Return a safe zero-state rather than propagating the error.
    return {
      isMining: false,
      minerAddress: null,
      difficulty: "0",
      blocksMined: 0,
      hashRate: 0,
      blockReward: "5000000000000000000",
      activeMiners: 0,
      sharesInRound: {},
      _stale: true,
    };
  }
}
