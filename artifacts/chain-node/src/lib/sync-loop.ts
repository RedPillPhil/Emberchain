/**
 * Autonomous peer-sync loop for the standalone chain-node service.
 * Identical logic to the api-server sync-loop — moved here so the
 * blockchain node is the sole owner of chain state and the sync process.
 */

import { chain } from "./chain";
import { getPeers, exchangePeers } from "./peers";
import type { StoredBlock, StoredTransaction, PersistedChain } from "@workspace/chain-core";

const SYNC_INTERVAL_MS = 10_000;
const PEX_INTERVAL_MS  = 5 * 60_000;
// How far back to re-scan when the sync loop stalls — must exceed any realistic
// fork depth.  64 was too small for a 127-block fork; 512 gives comfortable
// headroom for deep re-orgs while still being a fast bulk-fetch.
const FORK_LOOKBACK = 512;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let pexTimer:  ReturnType<typeof setInterval> | null = null;
let _stallCount = 0;
let _cachedBestPeer: string | null = null;
let _lastPeerPollMs = 0;
const PEER_REPOLL_INTERVAL_MS = 5 * 60_000;
let _bestPeerHeight = 0;

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

const BATCH_SIZE = 5000;

async function fetchBatch(
  peer: string,
  from: number,
  limit = BATCH_SIZE,
): Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> {
  try {
    const r = await fetch(`${peer}/api/sync/blocks?from=${from}&limit=${limit}`, {
      signal: AbortSignal.timeout(60_000),
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
  let peerInfo: PeerInfo | null = null;

  if (!needRepoll && _cachedBestPeer) {
    peerInfo = await queryPeer(_cachedBestPeer);
    if (!peerInfo) { _cachedBestPeer = null; }
  }

  if (!peerInfo) {
    const results = await Promise.all(peers.map(queryPeer));
    const reachable = results.filter((p): p is PeerInfo => p !== null);
    reachable.sort((a, b) => (b.td > a.td ? 1 : b.td < a.td ? -1 : 0));
    if (reachable.length > 0) {
      peerInfo = reachable[0]!;
      _cachedBestPeer = peerInfo.url;
      _lastPeerPollMs = now;
    } else { return; }
  }

  if (peerInfo.height > _bestPeerHeight) _bestPeerHeight = peerInfo.height;

  const peer = peerInfo.url;
  const peerShort = peer.replace(/^https?:\/\//, "");

  if (ourHeight <= 1) {
    const ok = await snapshotBootstrap(peer, peerShort);
    if (ok) {
      const newStatus = await chain.getStatus().catch(() => null);
      ourHeight = newStatus?.height ?? ourHeight;
      ourTD     = chain.getTotalDifficulty();
      console.log(`[${ts()}] [sync] ✅ Snapshot bootstrap complete — at block ${ourHeight}`);
    }
  }

  let peerHeight = peerInfo.height;
  let peerTD     = peerInfo.td;

  if (peerTD <= ourTD && peerHeight <= ourHeight) {
    _stallCount = 0;
    console.log(`[${ts()}] [sync] ✅ In sync with ${peerShort} (height ${ourHeight})`);
    return;
  }

  console.log(`[${ts()}] [sync] 📥 ${peerShort} is ${peerHeight - ourHeight} blocks ahead — draining …`);

  let drainFrom = _stallCount > 0 ? Math.max(1, ourHeight - FORK_LOOKBACK) : ourHeight + 1;
  let prefetch: Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> =
    fetchBatch(peer, drainFrom);

  while (true) {
    const batchBlocks = await prefetch;
    if (!batchBlocks || batchBlocks.length === 0) {
      if (!batchBlocks) console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable`);
      break;
    }

    const canonical = extractCanonicalSubchain(batchBlocks);
    const nextFrom = (canonical[canonical.length - 1]?.number ?? drainFrom) + 1;
    prefetch = nextFrom <= peerHeight ? fetchBatch(peer, nextFrom) : Promise.resolve(null);

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

    if (ourHeight > heightBefore) {
      _stallCount = 0;
      const remaining = peerHeight - ourHeight;
      if (remaining <= 0) { console.log(`[${ts()}] [sync] 🎉 Fully synced at ${ourHeight}`); break; }
      console.log(`[${ts()}] [sync] ↑ ${ourHeight} (${remaining} remaining) …`);
      drainFrom = ourHeight + 1;
      if (ourHeight >= peerHeight) break;
    } else {
      _stallCount++;
      console.warn(`[${ts()}] [sync] ⚠️  No progress at ${ourHeight} (stall #${_stallCount})`);
      if (_stallCount >= 2 && peerHeight - ourHeight > 200) {
        console.warn(`[${ts()}] [sync] 🔄 Deep stall — downloading fresh snapshot`);
        const ok = await snapshotBootstrap(peer, peerShort);
        if (ok) {
          _stallCount = 0;
          const recovered = await chain.getStatus().catch(() => null);
          console.log(`[${ts()}] [sync] ✅ Recovered via snapshot — now at block ${recovered?.height ?? "?"}`);
        }
      }
      break;
    }
  }
}

export function triggerSync(): void { void syncOnce(); }
export function getBestPeerHeight(): number { return _bestPeerHeight; }

const STARTUP_DELAY_MS = 5_000; // shorter for dedicated node service

export function startSyncLoop(): void {
  if (syncTimer) return;
  console.log(`[sync-loop] Chain node started — first sync in ${STARTUP_DELAY_MS / 1000} s`);

  const firstSync = setTimeout(() => {
    void syncOnce();
    syncTimer = setInterval(() => { void syncOnce(); }, SYNC_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  syncTimer = firstSync as unknown as ReturnType<typeof setInterval>;

  pexTimer = setTimeout(() => {
    void exchangePeers();
    pexTimer = setInterval(() => { void exchangePeers(); }, PEX_INTERVAL_MS);
  }, STARTUP_DELAY_MS + 5_000) as unknown as ReturnType<typeof setInterval>;
}

export function stopSyncLoop(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (pexTimer)  { clearInterval(pexTimer);  pexTimer  = null; }
}
