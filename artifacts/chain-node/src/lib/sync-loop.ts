/**
 * Autonomous peer-sync loop for the standalone chain-node service.
 * Identical logic to the api-server sync-loop — moved here so the
 * blockchain node is the sole owner of chain state and the sync process.
 */

import { chain } from "./chain";
import { getPeers, exchangePeers } from "./peers";
import type { StoredBlock, StoredTransaction, PersistedChain } from "@workspace/chain-core";

const SYNC_INTERVAL_MS      = 10_000;  // while catching up
const IDLE_SYNC_INTERVAL_MS = 15_000;  // once fully in sync — blocks arrive every ~8s, check often
const PEX_INTERVAL_MS       = 5 * 60_000;
// How far back to re-scan when the sync loop stalls — must exceed any realistic
// fork depth.  64 was too small for a 127-block fork; 512 gives comfortable
// headroom for deep re-orgs while still being a fast bulk-fetch.
const FORK_LOOKBACK = 512;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pexTimer:  ReturnType<typeof setTimeout> | null = null;
let _stallCount = 0;
let _isSynced = false;           // true once we've caught up — drives adaptive interval
let _syncLoopActive = false;     // guards against double-start
let _cachedBestPeer: string | null = null;
let _lastPeerPollMs = 0;
const PEER_REPOLL_INTERVAL_MS = 5 * 60_000;
let _bestPeerHeight = 0;

// Pending callers waiting for the next syncOnce() to complete (for pre-tx sync)
let _syncWaiters: Array<() => void> = [];

function ts() { return new Date().toISOString().slice(11, 19); }

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

let BATCH_SIZE = 5000;
let BATCH_DELAY_MS = 0; // ms to sleep between batches (0 = full speed for server nodes)
// Idle interval override — 0 means use the built-in adaptive constants above
let IDLE_INTERVAL_OVERRIDE_MS = 0;
// When true, skip the one-shot snapshot download and always use gradual batch sync.
// Set this for embedded desktop/home nodes to avoid the large initial transfer.
let SKIP_SNAPSHOT = false;

/** Call before startSyncLoop() to throttle sync (e.g. embedded desktop node). */
export function configureSyncLoop(opts: {
  batchSize?: number;
  batchDelayMs?: number;
  /** Override the idle polling interval (ms). Useful for embedded nodes on home connections. */
  idleIntervalMs?: number;
  /**
   * When true, skip the one-shot full-chain snapshot download on first launch.
   * The node will sync gradually using the configured batch settings instead.
   * Use this for embedded desktop nodes to prevent saturating a home connection.
   */
  skipSnapshot?: boolean;
}): void {
  if (opts.batchSize       !== undefined) BATCH_SIZE               = opts.batchSize;
  if (opts.batchDelayMs    !== undefined) BATCH_DELAY_MS           = opts.batchDelayMs;
  if (opts.idleIntervalMs  !== undefined) IDLE_INTERVAL_OVERRIDE_MS = opts.idleIntervalMs;
  if (opts.skipSnapshot    !== undefined) SKIP_SNAPSHOT            = opts.skipSnapshot;
}

async function fetchBatch(
  peer: string,
  from: number,
  limit = BATCH_SIZE,
): Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> {
  try {
    const r = await fetch(`${peer}/api/sync/blocks?from=${from}&limit=${limit}`, {
      signal: AbortSignal.timeout(15_000),  // was 60s — fail fast so we can try another peer
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
    if (!r.ok) {
      console.warn(`[${ts()}] [sync] ⚠️  Snapshot HTTP ${r.status} — falling back`);
      return false;
    }
    const snapshot = (await r.json()) as PersistedChain;
    if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) {
      console.warn(`[${ts()}] [sync] ⚠️  Empty snapshot — falling back`);
      return false;
    }
    await chain.importSnapshot(snapshot);
    return true;
  } catch (err) {
    console.warn(`[${ts()}] [sync] ⚠️  Snapshot failed (${(err as Error).message}) — falling back`);
    return false;
  }
}

type PeerInfo = { url: string; height: number; td: bigint };

async function queryPeer(url: string): Promise<PeerInfo | null> {
  try {
    const r = await fetch(`${url}/api/sync/status`, { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return null;
    const ps = await r.json() as { latestBlock?: number; totalDifficulty?: string };
    return {
      url,
      height: ps.latestBlock ?? 0,
      td: ps.totalDifficulty ? BigInt(ps.totalDifficulty) : 0n,
    };
  } catch { return null; }
}

async function syncOnce(): Promise<void> {
  // Snapshot and clear waiters; notify them in finally so pre-tx callers unblock.
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

    // Full sorted peer list — we keep this so we can fall back to alternates
    // within the same cycle if the best peer's block fetch fails.
    let sortedPeers: PeerInfo[] = [];

    if (!needRepoll && _cachedBestPeer) {
      const cached = await queryPeer(_cachedBestPeer);
      if (cached) {
        sortedPeers = [cached];
      } else {
        _cachedBestPeer = null;
      }
    }

    if (sortedPeers.length === 0) {
      const results = await Promise.all(peers.map(queryPeer));
      sortedPeers = results
        .filter((p): p is PeerInfo => p !== null)
        .sort((a, b) => (b.td > a.td ? 1 : b.td < a.td ? -1 : 0));
      if (sortedPeers.length === 0) return;
      _cachedBestPeer = sortedPeers[0]!.url;
      _lastPeerPollMs = now;
    }

    const bestPeer = sortedPeers[0]!;
    if (bestPeer.height > _bestPeerHeight) _bestPeerHeight = bestPeer.height;

    // Check whether we're already in sync with the best peer
    if (bestPeer.td <= ourTD && bestPeer.height <= ourHeight) {
      _stallCount = 0;
      _isSynced = true;
      const peerShort = bestPeer.url.replace(/^https?:\/\//, "");
      console.log(`[${ts()}] [sync] ✅ In sync with ${peerShort} (height ${ourHeight})`);
      return;
    }

    _isSynced = false; // actively downloading — keep fast interval

    // Bootstrap from snapshot on a brand-new node (skipped for home/desktop nodes
    // where the large one-shot download would saturate the connection — they use
    // gradual batch sync instead, controlled by BATCH_SIZE / BATCH_DELAY_MS).
    if (ourHeight <= 1 && !SKIP_SNAPSHOT) {
      const peer      = bestPeer.url;
      const peerShort = peer.replace(/^https?:\/\//, "");
      const ok = await snapshotBootstrap(peer, peerShort);
      if (ok) {
        const newStatus = await chain.getStatus().catch(() => null);
        ourHeight = newStatus?.height ?? ourHeight;
        ourTD     = chain.getTotalDifficulty();
        console.log(`[${ts()}] [sync] ✅ Snapshot bootstrap complete — at block ${ourHeight}`);
      }
    }

    // Drain blocks — try each peer in turn if the current one fails
    for (const peerInfo of sortedPeers) {
      const peer      = peerInfo.url;
      const peerShort = peer.replace(/^https?:\/\//, "");

      // Skip peers that aren't ahead of us
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
          if (!batchBlocks) {
            console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable — trying next peer`);
            peerFailed = true;
            _cachedBestPeer = null; // force re-poll next cycle
          }
          break;
        }

        const canonical = extractCanonicalSubchain(batchBlocks);
        const nextFrom  = (canonical[canonical.length - 1]?.number ?? drainFrom) + 1;

        // For server nodes (BATCH_DELAY_MS = 0) start the next fetch immediately so
        // network I/O overlaps with block processing — preserves throughput.
        // For desktop/home nodes (BATCH_DELAY_MS > 0) we do NOT start the fetch here;
        // instead we start it AFTER the delay below.  The old code started it here then
        // slept, which meant the delay only throttled processing time, not network
        // activity — the connection was still saturated at full speed.
        if (BATCH_DELAY_MS === 0) {
          prefetch = nextFrom <= peerHeight ? fetchBatch(peer, nextFrom) : Promise.resolve(null);
        }

        const heightBefore = ourHeight;
        let aborted = false;
        for (const blockData of canonical) {
          const { transactions, ...block } = blockData;
          try {
            await chain.importBlock(block as StoredBlock, transactions ?? []);
          } catch (err) {
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
          if (BATCH_DELAY_MS > 0) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
            // Start the fetch NOW — after the delay — so the sleep genuinely
            // separates consecutive HTTP requests and caps bandwidth.
            prefetch = drainFrom <= peerHeight ? fetchBatch(peer, drainFrom) : Promise.resolve(null);
          }
        } else {
          _stallCount++;
          console.warn(`[${ts()}] [sync] ⚠️  No progress at ${ourHeight} (stall #${_stallCount})`);
          // Only attempt a full snapshot download on a deep stall AND only when
          // the node is NOT configured for gentle/desktop mode (SKIP_SNAPSHOT).
          // Downloading a snapshot on a home connection (~180 MB) saturates the
          // link for minutes and makes the desktop wallet unusable.
          // Desktop nodes back off and retry gradual batch sync instead.
          if (_stallCount >= 2 && !SKIP_SNAPSHOT) {
            console.warn(`[${ts()}] [sync] 🔄 Deep stall — downloading fresh snapshot`);
            const ok = await snapshotBootstrap(peer, peerShort);
            if (ok) {
              _stallCount = 0;
              const recovered = await chain.getStatus().catch(() => null);
              console.log(`[${ts()}] [sync] ✅ Recovered via snapshot — now at block ${recovered?.height ?? "?"}`);
            }
          } else if (_stallCount >= 2 && SKIP_SNAPSHOT) {
            // Desktop/home node: reset stall count and let the next scheduled
            // sync attempt try a different peer or a fresh fetch from further back.
            console.warn(`[${ts()}] [sync] 🔄 Stall on desktop node — will retry next cycle (no snapshot download)`);
            _stallCount = 0;
            _cachedBestPeer = null; // force re-poll to try a different peer next cycle
          }
          break;
        }
      }

      // Peer succeeded (or we're caught up) — stop trying alternates
      if (!peerFailed) break;
    }
  } finally {
    // Always unblock any callers waiting on syncAndWait()
    waiters.forEach((resolve) => resolve());
  }
}

export function triggerSync(): void { void syncOnce(); }
export function getBestPeerHeight(): number { return _bestPeerHeight; }
export function isChainSynced(): boolean { return _isSynced; }

/**
 * Trigger a sync and wait for it to complete — used by the transaction route
 * so the chain is current before accepting a new transaction.
 * Resolves as soon as the in-flight (or next) sync cycle finishes, or after
 * `timeoutMs` if the node is unreachable.
 */
export function syncAndWait(timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs); // safety valve
    _syncWaiters.push(() => { clearTimeout(timer); resolve(); });
    // Kick off a sync immediately — if one is already running the waiters array
    // will be drained when it completes.
    void syncOnce();
  });
}

const STARTUP_DELAY_MS = 5_000;

function scheduleNextSync(): void {
  if (!_syncLoopActive) return;
  const idleMs = IDLE_INTERVAL_OVERRIDE_MS > 0 ? IDLE_INTERVAL_OVERRIDE_MS : IDLE_SYNC_INTERVAL_MS;
  const delay = _isSynced ? idleMs : SYNC_INTERVAL_MS;
  syncTimer = setTimeout(async () => {
    try { await syncOnce(); } catch (err) {
      console.error(`[${ts()}] [sync] 💥 Unhandled error in syncOnce:`, err);
    }
    scheduleNextSync();
  }, delay);
}

export function startSyncLoop(): void {
  if (_syncLoopActive) return;
  _syncLoopActive = true;
  console.log(`[sync-loop] Chain node started — first sync in ${STARTUP_DELAY_MS / 1000} s`);

  syncTimer = setTimeout(async () => {
    await syncOnce();
    scheduleNextSync();
  }, STARTUP_DELAY_MS);

  pexTimer = setTimeout(function pex() {
    void exchangePeers();
    pexTimer = setTimeout(pex, PEX_INTERVAL_MS);
  }, STARTUP_DELAY_MS + 5_000);
}

export function stopSyncLoop(): void {
  _syncLoopActive = false;
  _isSynced = false;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (pexTimer)  { clearTimeout(pexTimer);  pexTimer  = null; }
  // Resolve any pending waiters so callers don't hang
  _syncWaiters.splice(0).forEach((r) => r());
}
