/**
 * Stale-while-revalidate cache for Ember Delta trade history.
 *
 * GET /api/dex/trades used to block on a full Base eth_getLogs scan (can take
 * minutes).  Instead we serve the last good snapshot immediately and refresh
 * in the background, persisting to disk so restarts stay instant.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  invalidateTradeScanCache,
  scanDexTradeLogs,
  type DexTradeLogDto,
} from "./dex-trade-scan";

const DATA_FILE =
  (process.env.DEX_TRADES_SNAPSHOT_FILE ?? "").trim() ||
  "./data/dex-trades-snapshot.json";

const POLL_MS = Math.max(
  30_000,
  Number(process.env.DEX_TRADES_POLL_MS ?? "60000") || 60_000,
);

export interface DexTradesSnapshot {
  headBlock: number;
  logs: DexTradeLogDto[];
  updatedAt: number;
  stale: boolean;
}

let snapshot: DexTradesSnapshot | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing = false;

function loadFromDisk(): DexTradesSnapshot | null {
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DexTradesSnapshot>;
    if (!Array.isArray(parsed.logs)) return null;
    return {
      headBlock: typeof parsed.headBlock === "number" ? parsed.headBlock : 0,
      logs: parsed.logs,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      stale: true,
    };
  } catch {
    return null;
  }
}

function persistToDisk(snap: DexTradesSnapshot): void {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({
      headBlock: snap.headBlock,
      logs: snap.logs,
      updatedAt: snap.updatedAt,
    }));
    renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error(
      "[dex-trades-cache] persist failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function refreshOnce(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    // Force a live scan — ignore the short in-memory CACHE_MS gate.
    invalidateTradeScanCache();
    const { headBlock, logs } = await scanDexTradeLogs(0);
    snapshot = {
      headBlock,
      logs,
      updatedAt: Date.now(),
      stale: false,
    };
    persistToDisk(snapshot);
    console.info(
      `[dex-trades-cache] refreshed ${logs.length} trades (head ${headBlock})`,
    );
  } catch (err) {
    console.warn(
      "[dex-trades-cache] refresh failed — keeping stale snapshot:",
      err instanceof Error ? err.message : err,
    );
    if (snapshot) snapshot = { ...snapshot, stale: true };
  } finally {
    refreshing = false;
  }
}

async function pollLoop(): Promise<void> {
  await refreshOnce();
  pollTimer = setTimeout(() => {
    void pollLoop();
  }, POLL_MS);
}

/** Start background refresh. Safe to call once at server boot. */
export function startDexTradesPoller(): void {
  if (pollTimer !== null) return;
  if (!snapshot) snapshot = loadFromDisk();
  // Kick immediately so cold starts warm without waiting for first browser hit.
  void pollLoop();
}

/**
 * Instant read path for GET /api/dex/trades.
 * Returns disk/memory snapshot; kicks a background refresh if none exists yet.
 */
export function getDexTradesCached(lookback: number): DexTradesSnapshot {
  if (!snapshot) {
    snapshot = loadFromDisk();
  }

  if (!snapshot) {
    // Cold start with no disk — kick refresh and return empty so the UI paints.
    void refreshOnce();
    return { headBlock: 0, logs: [], updatedAt: 0, stale: true };
  }

  // Keep the snapshot warm if it's older than a poll interval.
  if (!refreshing && Date.now() - snapshot.updatedAt > POLL_MS) {
    void refreshOnce();
  }

  const filterFrom =
    lookback > 0 && snapshot.headBlock > lookback
      ? snapshot.headBlock - lookback
      : 0;

  return {
    headBlock: snapshot.headBlock,
    logs:
      filterFrom > 0
        ? snapshot.logs.filter((l) => l.blockNumber >= filterFrom)
        : snapshot.logs,
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale || refreshing || Date.now() - snapshot.updatedAt > POLL_MS,
  };
}

/** After a fill/ingest, refresh ASAP so history includes the new trade. */
export function bumpDexTradesRefresh(): void {
  void refreshOnce();
}
