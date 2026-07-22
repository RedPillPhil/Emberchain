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
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

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

// Batch size for block fetches — larger = fewer round trips during catch-up
const BATCH_SIZE = 2000;

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
    // Peer may be offline or running an older version without totalDifficulty —
    // fall back to height-only comparison
    peerTD = peerHeight > ourHeight ? ourTD + 1n : ourTD;
  }

  // Skip if the peer has no more work than us
  if (peerTD <= ourTD && peerHeight <= ourHeight) {
    _stallCount = 0;
    console.log(`[${ts()}] [sync] ✅ In sync with ${peerShort} (height ${ourHeight})`);
    return;
  }

  const gap = peerHeight - ourHeight;
  console.log(`[${ts()}] [sync] 📥 ${peerShort} is ${gap > 0 ? gap + " blocks" : "a fork"} ahead — draining from ${ourHeight + 1} …`);

  // ── Drain loop ───────────────────────────────────────────────────────────
  // Fetch batch after batch with no delay until we're caught up or stall.
  // This avoids the previous behaviour of fetching one 500-block batch then
  // sitting idle for 10 seconds before the next one.
  let drainFrom = _stallCount > 0
    ? Math.max(1, ourHeight - FORK_LOOKBACK)
    : ourHeight + 1;

  while (true) {
    let batchBlocks: Array<StoredBlock & { transactions: StoredTransaction[] }> = [];
    try {
      const r = await fetch(
        `${peer}/api/sync/blocks?from=${drainFrom}&limit=${BATCH_SIZE}`,
        { signal: AbortSignal.timeout(60_000) },
      );
      if (!r.ok) {
        console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} HTTP ${r.status} — stopping drain`);
        break;
      }
      const data = (await r.json()) as {
        blocks: Array<StoredBlock & { transactions: StoredTransaction[] }>;
      };
      if (!Array.isArray(data.blocks) || data.blocks.length === 0) break;
      batchBlocks = data.blocks;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable: ${msg}`);
      break;
    }

    // Strip competing blocks at the same height — keep only the canonical chain
    const canonical = extractCanonicalSubchain(batchBlocks);
    const skipped   = batchBlocks.length - canonical.length;
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
      // Refresh peer tip so we don't overshoot if the chain has grown
      if (ourHeight >= peerHeight) break;
    } else {
      // No progress — don't spin, let the next timed interval retry
      _stallCount++;
      console.warn(`[${ts()}] [sync] ⚠️  No progress at ${ourHeight} (stall #${_stallCount}) — will retry`);
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
