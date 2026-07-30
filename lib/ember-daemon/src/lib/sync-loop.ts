/**
 * Autonomous peer-sync loop for the standalone ember-daemon.
 * Adapted from artifacts/chain-node/src/lib/sync-loop.ts — logic is identical;
 * only the import paths differ (local lib/ instead of artifacts/chain-node/lib/).
 */

import { chain } from "./chain.js";
import { getPeers, exchangePeers, exchangePeersSequential } from "./peers.js";
import type { StoredBlock, StoredTransaction, PersistedChain } from "@workspace/chain-core";

const SYNC_INTERVAL_MS      = 10_000;
const IDLE_SYNC_INTERVAL_MS = 15_000;
const PEX_INTERVAL_MS       = 5 * 60_000;
const FORK_LOOKBACK         = 512;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pexTimer:  ReturnType<typeof setTimeout> | null = null;
let _stallCount = 0;
let _isSynced = false;
let _syncLoopActive = false;
let _cachedBestPeer: string | null = null;
let _lastPeerPollMs = 0;
const PEER_REPOLL_INTERVAL_MS = 5 * 60_000;
let _bestPeerHeight = 0;
let _syncWaiters: Array<() => void> = [];

function ts() { return new Date().toISOString().slice(11, 19); }

let BATCH_SIZE            = 5000;
let BATCH_DELAY_MS        = 0;
let IDLE_INTERVAL_OVERRIDE_MS = 0;
let SKIP_SNAPSHOT         = false;
let GENTLE_PEX            = false;
const GENTLE_PEX_INTERVAL_MS = 15 * 60_000;

export function configureSyncLoop(opts: {
  batchSize?: number;
  batchDelayMs?: number;
  idleIntervalMs?: number;
  skipSnapshot?: boolean;
  gentlePex?: boolean;
}): void {
  if (opts.batchSize       !== undefined) BATCH_SIZE                = opts.batchSize;
  if (opts.batchDelayMs    !== undefined) BATCH_DELAY_MS            = opts.batchDelayMs;
  if (opts.idleIntervalMs  !== undefined) IDLE_INTERVAL_OVERRIDE_MS = opts.idleIntervalMs;
  if (opts.skipSnapshot    !== undefined) SKIP_SNAPSHOT             = opts.skipSnapshot;
  if (opts.gentlePex       !== undefined) GENTLE_PEX                = opts.gentlePex;
}

function extractCanonicalSubchain(
  blocks: Array<StoredBlock & { transactions: StoredTransaction[] }>,
): Array<StoredBlock & { transactions: StoredTransaction[] }> {
  if (blocks.length === 0) return blocks;
  const byHash = new Map(blocks.map((b) => [b.hash, b]));
  const usedAsParent = new Set(blocks.map((b) => b.parentHash));
  const tips = blocks.filter((b) => !usedAsParent.has(b.hash));
  const candidates = tips.length > 0 ? tips : blocks;
  const maxHeight = Math.max(...candidates.map((b) => b.number));
  const tip = candidates.filter((b) => b.number === maxHeight).at(-1)!;
  const result: Array<StoredBlock & { transactions: StoredTransaction[] }> = [];
  let cur: (StoredBlock & { transactions: StoredTransaction[] }) | undefined = tip;
  while (cur) { result.unshift(cur); cur = byHash.get(cur.parentHash); }
  return result;
}

async function fetchBatch(
  peer: string,
  from: number,
  limit = BATCH_SIZE,
): Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> {
  try {
    const r = await fetch(`${peer}/api/sync/blocks?from=${from}&limit=${limit}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { blocks: Array<StoredBlock & { transactions: StoredTransaction[] }> };
    return Array.isArray(data.blocks) ? data.blocks : null;
  } catch { return null; }
}

async function snapshotBootstrap(peer: string, peerShort: string): Promise<boolean> {
  console.log(`[${ts()}] [sync] 🚀 First launch — downloading full snapshot from ${peerShort} …`);
  try {
    const r = await fetch(`${peer}/api/sync/snapshot`, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) { console.warn(`[${ts()}] [sync] ⚠️  Snapshot HTTP ${r.status}`); return false; }
    const snapshot = (await r.json()) as PersistedChain;
    if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) {
      console.warn(`[${ts()}] [sync] ⚠️  Empty snapshot`); return false;
    }
    await chain.importSnapshot(snapshot);
    return true;
  } catch (err) {
    console.warn(`[${ts()}] [sync] ⚠️  Snapshot failed (${(err as Error).message})`);
    return false;
  }
}

type PeerInfo = { url: string; height: number; td: bigint };

async function queryPeer(url: string, timeoutMs = 5_000): Promise<PeerInfo | null> {
  try {
    const r = await fetch(`${url}/api/sync/status`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const ps = await r.json() as { latestBlock?: number; totalDifficulty?: string };
    return { url, height: ps.latestBlock ?? 0, td: ps.totalDifficulty ? BigInt(ps.totalDifficulty) : 0n };
  } catch { return null; }
}

async function syncOnce(): Promise<void> {
  const waiters = _syncWaiters.splice(0);
  try {
    const peers = getPeers();
    if (peers.length === 0) return;

    let ourHeight: number;
    let ourTD: bigint;
    try {
      const status = await chain.getStatus();
      ourHeight = status.height;
      ourTD     = chain.getTotalDifficulty();
    } catch { return; }

    const now = Date.now();
    const needRepoll = !_cachedBestPeer || (now - _lastPeerPollMs) > PEER_REPOLL_INTERVAL_MS;
    let sortedPeers: PeerInfo[] = [];

    if (!needRepoll && _cachedBestPeer) {
      const cached = await queryPeer(_cachedBestPeer);
      if (cached) sortedPeers = [cached];
      else _cachedBestPeer = null;
    }

    if (sortedPeers.length === 0) {
      if (BATCH_DELAY_MS > 0) {
        const results: PeerInfo[] = [];
        for (const url of peers) {
          const result = await queryPeer(url, 2_000);
          if (result) results.push(result);
        }
        sortedPeers = results.sort((a, b) => (b.td > a.td ? 1 : b.td < a.td ? -1 : 0));
      } else {
        const results = await Promise.all(peers.map(queryPeer));
        sortedPeers = results
          .filter((p): p is PeerInfo => p !== null)
          .sort((a, b) => (b.td > a.td ? 1 : b.td < a.td ? -1 : 0));
      }
      if (sortedPeers.length > 0) { _cachedBestPeer = sortedPeers[0]!.url; _lastPeerPollMs = now; }
      if (sortedPeers.length === 0) return;
    }

    const bestPeer = sortedPeers[0]!;
    if (bestPeer.height > _bestPeerHeight) _bestPeerHeight = bestPeer.height;

    if (bestPeer.td <= ourTD && bestPeer.height <= ourHeight) {
      _stallCount = 0; _isSynced = true;
      const peerShort = bestPeer.url.replace(/^https?:\/\//, "");
      console.log(`[${ts()}] [sync] ✅ In sync with ${peerShort} (height ${ourHeight})`);
      return;
    }

    _isSynced = false;

    if (ourHeight <= 1 && !SKIP_SNAPSHOT) {
      const ok = await snapshotBootstrap(bestPeer.url, bestPeer.url.replace(/^https?:\/\//, ""));
      if (ok) {
        const ns = await chain.getStatus().catch(() => null);
        ourHeight = ns?.height ?? ourHeight;
        ourTD     = chain.getTotalDifficulty();
        console.log(`[${ts()}] [sync] ✅ Snapshot bootstrap complete — at block ${ourHeight}`);
      }
    }

    for (const peerInfo of sortedPeers) {
      const peer      = peerInfo.url;
      const peerShort = peer.replace(/^https?:\/\//, "");
      if (peerInfo.td <= ourTD && peerInfo.height <= ourHeight) continue;

      const peerHeight = peerInfo.height;
      console.log(`[${ts()}] [sync] 📥 ${peerShort} is ${peerHeight - ourHeight} blocks ahead — draining …`);

      let drainFrom = _stallCount > 0 ? Math.max(1, ourHeight - FORK_LOOKBACK) : ourHeight + 1;
      let prefetch: Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> =
        fetchBatch(peer, drainFrom);

      let peerFailed = false;
      while (true) {
        const batchBlocks = await prefetch;
        if (!batchBlocks || batchBlocks.length === 0) {
          if (!batchBlocks) { console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable`); peerFailed = true; _cachedBestPeer = null; }
          break;
        }

        const canonical = extractCanonicalSubchain(batchBlocks);
        const nextFrom  = (canonical[canonical.length - 1]?.number ?? drainFrom) + 1;

        if (BATCH_DELAY_MS === 0) {
          prefetch = nextFrom <= peerHeight ? fetchBatch(peer, nextFrom) : Promise.resolve(null);
        }

        const heightBefore = ourHeight;
        let aborted = false;
        for (const blockData of canonical) {
          const { transactions, ...block } = blockData;
          try { await chain.importBlock(block as StoredBlock, transactions ?? []); }
          catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Reorg aborted")) { aborted = true; break; }
            if (!msg.includes("already")) console.warn(`[${ts()}] [sync] importBlock #${(block as StoredBlock).number}: ${msg}`);
          }
        }
        if (aborted) break;

        const newStatus = await chain.getStatus().catch(() => null);
        ourHeight = newStatus?.height ?? ourHeight;
        ourTD     = chain.getTotalDifficulty();

        if (ourHeight > heightBefore) {
          _stallCount = 0;
          const remaining = peerHeight - ourHeight;
          if (remaining <= 0) { console.log(`[${ts()}] [sync] 🎉 Fully synced at ${ourHeight}`); break; }
          console.log(`[${ts()}] [sync] ↑ ${ourHeight} (${remaining} remaining) …`);
          drainFrom = ourHeight + 1;
          if (ourHeight >= peerHeight) break;
          if (BATCH_DELAY_MS > 0) break;
        } else {
          _stallCount++;
          console.warn(`[${ts()}] [sync] ⚠️  No progress at ${ourHeight} (stall #${_stallCount})`);
          if (_stallCount >= 2 && !SKIP_SNAPSHOT) {
            console.warn(`[${ts()}] [sync] 🔄 Deep stall — downloading fresh snapshot`);
            const ok = await snapshotBootstrap(peer, peerShort);
            if (ok) { _stallCount = 0; const rec = await chain.getStatus().catch(() => null); console.log(`[${ts()}] [sync] ✅ Recovered — block ${rec?.height ?? "?"}`); }
          } else if (_stallCount >= 2 && SKIP_SNAPSHOT) {
            console.warn(`[${ts()}] [sync] 🔄 Stall on desktop node — retrying next cycle`);
            _stallCount = 0; _cachedBestPeer = null;
          }
          break;
        }
      }
      if (!peerFailed) break;
    }
  } finally {
    waiters.forEach((resolve) => resolve());
  }
}

export function triggerSync(): void { void syncOnce(); }
export function getBestPeerHeight(): number { return _bestPeerHeight; }
export function isChainSynced(): boolean { return _isSynced; }

export function syncAndWait(timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    _syncWaiters.push(() => { clearTimeout(timer); resolve(); });
    void syncOnce();
  });
}

const STARTUP_DELAY_MS = 5_000;

function scheduleNextSync(): void {
  if (!_syncLoopActive) return;
  const idleMs    = IDLE_INTERVAL_OVERRIDE_MS > 0 ? IDLE_INTERVAL_OVERRIDE_MS : IDLE_SYNC_INTERVAL_MS;
  const catchupMs = BATCH_DELAY_MS > 0 ? BATCH_DELAY_MS : SYNC_INTERVAL_MS;
  const delay     = _isSynced ? idleMs : catchupMs;
  syncTimer = setTimeout(async () => {
    try { await syncOnce(); } catch (err) { console.error(`[${ts()}] [sync] 💥 syncOnce error:`, err); }
    scheduleNextSync();
  }, delay);
}

export function startSyncLoop(): void {
  if (_syncLoopActive) return;
  _syncLoopActive = true;
  console.log(`[sync-loop] ember-daemon started — first sync in ${STARTUP_DELAY_MS / 1000} s`);

  syncTimer = setTimeout(async () => { await syncOnce(); scheduleNextSync(); }, STARTUP_DELAY_MS);

  if (GENTLE_PEX) {
    const GENTLE_PEX_FIRST_DELAY_MS = 2 * 60_000;
    pexTimer = setTimeout(function pex() {
      void exchangePeersSequential();
      pexTimer = setTimeout(pex, GENTLE_PEX_INTERVAL_MS);
    }, GENTLE_PEX_FIRST_DELAY_MS);
  } else {
    pexTimer = setTimeout(function pex() {
      void exchangePeers();
      pexTimer = setTimeout(pex, PEX_INTERVAL_MS);
    }, STARTUP_DELAY_MS + 5_000);
  }
}

export function stopSyncLoop(): void {
  _syncLoopActive = false;
  _isSynced = false;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (pexTimer)  { clearTimeout(pexTimer);  pexTimer  = null; }
  _syncWaiters.splice(0).forEach((r) => r());
}
