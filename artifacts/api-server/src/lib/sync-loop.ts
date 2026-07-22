/**
 * Autonomous peer-sync loop.
 *
 * Runs independently of any central server — once started, this loop keeps any
 * Emberchain node in sync purely by polling its known peers.
 *
 * Implements Nakamoto fork-choice: if a peer reports a higher totalDifficulty
 * than our canonical chain, we request their blocks from the divergence point
 * and let chain.importBlock() handle the reorg automatically.
 *
 * Two intervals:
 *   SYNC_INTERVAL_MS (default 30 s) — pull new blocks / detect forks from a random peer
 *   PEX_INTERVAL_MS  (default 5 min) — ask all peers for their peer lists
 *
 * Stall detection:
 *   If the peer is ahead but we import 0 blocks for a round, our local tip is
 *   probably on the wrong fork branch.  After one stalled round we step back
 *   FORK_LOOKBACK blocks so importBlock can find the common ancestor, compute
 *   incomingTD correctly, and fire the reorg that promotes the heavier chain.
 */

import { chain } from "./chain";
import { getPeers, exchangePeers } from "./peers";
import type { StoredBlock, StoredTransaction, PersistedChain } from "@workspace/chain-core";

const SYNC_INTERVAL_MS = 10_000;   // poll every 10 s for faster catch-up
const PEX_INTERVAL_MS  = 5 * 60_000;

// How many blocks to look back when searching for a fork divergence point
const FORK_LOOKBACK = 64;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let pexTimer:  ReturnType<typeof setInterval> | null = null;

// Consecutive rounds where the peer was ahead but we imported nothing.
// After ≥1 stalled round we step back to find the fork.
let _stallCount = 0;

// ── Block sync ────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString().slice(11, 19); }

/**
 * Given a raw batch from the peer (which may contain multiple competing blocks
 * at the same height), return only the blocks that form a single canonical
 * chain ending at the batch's highest block.
 *
 * Algorithm:
 *   1. Find "tips" — blocks whose hash is not referenced as parentHash by any
 *      other block in the batch.  These are genuine chain endpoints.
 *   2. Pick the tip at the maximum height (last returned if tied — typically
 *      the highest stored TD on the server).
 *   3. Walk backwards from the tip via parentHash, collecting only blocks
 *      present in the batch.
 *   4. Return the result in ascending block-number order.
 *
 * Even if the chosen tip turns out to be a 1-block orphan (ambiguous at the
 * very end of the batch), the chain BELOW that point is always canonical —
 * which is exactly what matters for resolving deep stalls.  A wrong final
 * block is a trivial 1-block reorg that the normal fork-choice handles.
 */
function extractCanonicalSubchain(
  blocks: Array<StoredBlock & { transactions: StoredTransaction[] }>,
): Array<StoredBlock & { transactions: StoredTransaction[] }> {
  if (blocks.length === 0) return blocks;

  const byHash = new Map(blocks.map((b) => [b.hash, b]));
  const usedAsParent = new Set(blocks.map((b) => b.parentHash));

  // Tips = blocks not referenced as a parent by anything else in the batch
  const tips = blocks.filter((b) => !usedAsParent.has(b.hash));
  const candidates = tips.length > 0 ? tips : blocks; // fallback: all blocks

  // Pick the tip at the highest block number; last in array wins ties
  // (server inserts canonical blocks last — highest stored TD)
  const maxHeight = Math.max(...candidates.map((b) => b.number));
  const tip = candidates.filter((b) => b.number === maxHeight).at(-1)!;

  // Walk backwards via parentHash through the batch
  const chain: Array<StoredBlock & { transactions: StoredTransaction[] }> = [];
  let cur: (StoredBlock & { transactions: StoredTransaction[] }) | undefined = tip;
  while (cur) {
    chain.unshift(cur);
    cur = byHash.get(cur.parentHash);
  }

  return chain;
}

// Batch size for block fetches — matches the raised server cap of 5000
const BATCH_SIZE = 5000;

/** Fetch a batch of blocks from a peer, returning null on any network error. */
async function fetchBatch(
  peer: string,
  from: number,
  limit = BATCH_SIZE,
): Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> {
  try {
    const r = await fetch(
      `${peer}/api/sync/blocks?from=${from}&limit=${limit}`,
      { signal: AbortSignal.timeout(60_000) },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as {
      blocks: Array<StoredBlock & { transactions: StoredTransaction[] }>;
    };
    return Array.isArray(data.blocks) ? data.blocks : null;
  } catch {
    return null;
  }
}

/**
 * Bootstrap a node that is still at genesis by downloading the peer's full
 * chain snapshot in one shot and importing it atomically.  Much faster than
 * paging through 5000-block batches because:
 *   - one HTTP request instead of N round trips
 *   - the snapshot includes pre-computed EVM state — no block-by-block replay
 *   - the node jumps straight to the peer's tip and only needs incremental
 *     updates from that point forward
 */
async function snapshotBootstrap(peer: string, peerShort: string): Promise<boolean> {
  console.log(`[${ts()}] [sync] 🚀 First launch — downloading full snapshot from ${peerShort} …`);
  try {
    const r = await fetch(`${peer}/api/sync/snapshot`, {
      signal: AbortSignal.timeout(120_000), // 2 min for large chain
    });
    if (!r.ok) {
      console.warn(`[${ts()}] [sync] ⚠️  Snapshot endpoint returned HTTP ${r.status} — falling back to block-by-block sync`);
      return false;
    }
    const snapshot = (await r.json()) as PersistedChain;
    if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) {
      console.warn(`[${ts()}] [sync] ⚠️  Snapshot was empty — falling back to block-by-block sync`);
      return false;
    }
    await chain.importSnapshot(snapshot);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${ts()}] [sync] ⚠️  Snapshot download failed (${msg}) — falling back to block-by-block sync`);
    return false;
  }
}

async function syncOnce(): Promise<void> {
  const peers = getPeers();
  if (peers.length === 0) return;

  // Pick a random peer each round for load distribution
  const peer = peers[Math.floor(Math.random() * peers.length)]!;
  const peerShort = peer.replace(/^https?:\/\//, "");

  // Get our current chain state
  let ourHeight: number;
  let ourTD: bigint;
  try {
    const status = await chain.getStatus();
    ourHeight = status.height;
    ourTD     = chain.getTotalDifficulty();
  } catch {
    return; // chain not ready yet
  }

  // ── Snapshot bootstrap ───────────────────────────────────────────────────
  // If we're still at genesis (height 0 or just the genesis block), download
  // the peer's full snapshot rather than syncing block-by-block.  This is
  // orders of magnitude faster: one HTTP request vs thousands of importBlock
  // calls.
  if (ourHeight <= 1) {
    const ok = await snapshotBootstrap(peer, peerShort);
    if (ok) {
      const newStatus = await chain.getStatus().catch(() => null);
      ourHeight = newStatus?.height ?? ourHeight;
      ourTD     = chain.getTotalDifficulty();
      console.log(`[${ts()}] [sync] ✅ Snapshot bootstrap complete — at block ${ourHeight}`);
      // Fall through to incremental drain for any blocks added since snapshot
    }
    // If snapshot failed, fall through to normal block-by-block sync below
  }

  // Get peer's chain state (includes totalDifficulty for fork-choice)
  let peerHeight = ourHeight;
  let peerTD     = ourTD;
  try {
    const sr = await fetch(`${peer}/api/sync/status`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (sr.ok) {
      const ps = await sr.json() as {
        latestBlock?: number;
        totalDifficulty?: string;
      };
      if (ps.latestBlock != null) {
        peerHeight = ps.latestBlock;
        if (peerHeight > _bestPeerHeight) _bestPeerHeight = peerHeight;
      }
      if (ps.totalDifficulty) peerTD = BigInt(ps.totalDifficulty);
    }
  } catch {
    peerTD = peerHeight > ourHeight ? ourTD + 1n : ourTD;
  }

  // Skip if the peer has no more work than us
  if (peerTD <= ourTD && peerHeight <= ourHeight) {
    _stallCount = 0;
    console.log(`[${ts()}] [sync] ✅ In sync with ${peerShort} (height ${ourHeight})`);
    return;
  }

  const gap = peerHeight - ourHeight;
  console.log(`[${ts()}] [sync] 📥 ${peerShort} is ${gap > 0 ? gap + " blocks" : "a fork"} ahead — draining …`);

  // ── Drain loop with pipeline prefetch ────────────────────────────────────
  // While importing the current batch we prefetch the next one in parallel
  // so there is zero wait between batches.  This gives ~2× throughput when
  // the network round-trip and importBlock time are roughly equal.
  let drainFrom = _stallCount > 0
    ? Math.max(1, ourHeight - FORK_LOOKBACK)
    : ourHeight + 1;

  // Kick off the first fetch immediately
  let prefetch: Promise<Array<StoredBlock & { transactions: StoredTransaction[] }> | null> =
    fetchBatch(peer, drainFrom);

  while (true) {
    const batchBlocks = await prefetch;

    if (!batchBlocks || batchBlocks.length === 0) {
      if (!batchBlocks) console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable — stopping drain`);
      break;
    }

    // Strip competing blocks at the same height — keep only the canonical chain
    const canonical = extractCanonicalSubchain(batchBlocks);
    const skipped   = batchBlocks.length - canonical.length;

    // Fire the next fetch immediately (pipeline) — runs while we import this batch
    const nextFrom = (canonical[canonical.length - 1]?.number ?? drainFrom) + 1;
    const stillBehind = nextFrom <= peerHeight;
    prefetch = stillBehind
      ? fetchBatch(peer, nextFrom)
      : Promise.resolve(null); // nothing left to fetch

    if (skipped > 0) {
      console.log(`[${ts()}] [sync] 🔍 Filtered: ${canonical.length} canonical, ${skipped} competing ignored`);
    }

    const heightBefore = ourHeight;
    let aborted = false;
    for (const blockData of canonical) {
      const { transactions, ...block } = blockData;
      try {
        await chain.importBlock(block as StoredBlock, transactions ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Reorg aborted")) {
          console.warn(`[${ts()}] [sync] Reorg incomplete, will retry next round: ${msg}`);
          aborted = true;
          break;
        }
        if (!msg.includes("already")) {
          console.warn(`[${ts()}] [sync] importBlock #${(block as StoredBlock).number}: ${msg}`);
        }
      }
    }
    if (aborted) break;

    // Measure actual progress
    const newStatus = await chain.getStatus().catch(() => null);
    ourHeight = newStatus?.height ?? ourHeight;

    if (ourHeight > heightBefore) {
      _stallCount = 0;
      const remaining = peerHeight - ourHeight;
      if (remaining <= 0) {
        console.log(`[${ts()}] [sync] 🎉 Fully synced at ${ourHeight}`);
        break;
      }
      console.log(`[${ts()}] [sync] ↑ ${ourHeight} (${remaining} remaining) …`);
      drainFrom = ourHeight + 1;
      if (ourHeight >= peerHeight) break;
    } else {
      _stallCount++;
      console.warn(`[${ts()}] [sync] ⚠️  No progress at ${ourHeight} (stall #${_stallCount}) — will retry`);

      // Deep stall: we're stuck and the peer is hundreds of blocks ahead.
      // Our local tip is on the wrong fork and the reorg can't fire because
      // we don't have the blocks needed to accumulate enough TD.
      // Download a fresh snapshot to jump straight to the canonical tip.
      if (_stallCount >= 2 && peerHeight - ourHeight > 200) {
        console.warn(`[${ts()}] [sync] 🔄 Deep stall detected — downloading fresh snapshot to recover`);
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

/** Trigger an immediate sync pass — useful to call right after seeding peers. */
export function triggerSync(): void {
  void syncOnce();
}

// Best known peer height — lets the UI show a sync progress bar
let _bestPeerHeight = 0;
export function getBestPeerHeight(): number { return _bestPeerHeight; }

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startSyncLoop(): void {
  if (syncTimer) return; // already running

  // Run immediately on start, then on interval
  void syncOnce();
  syncTimer = setInterval(() => { void syncOnce(); }, SYNC_INTERVAL_MS);

  // Peer exchange — grow the mesh over time
  void exchangePeers();
  pexTimer = setInterval(() => { void exchangePeers(); }, PEX_INTERVAL_MS);

  console.log("[sync-loop] Started — syncing every 30 s (fork-choice enabled), PEX every 5 min");
}

export function stopSyncLoop(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (pexTimer)  { clearInterval(pexTimer);  pexTimer  = null; }
}
