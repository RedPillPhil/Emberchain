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
      if (ps.totalDifficulty)       peerTD     = BigInt(ps.totalDifficulty);
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
  console.log(`[${ts()}] [sync] 📥 ${peerShort} is ${gap > 0 ? gap + " blocks" : "a fork"} ahead (us: ${ourHeight}, peer: ${peerHeight})${_stallCount > 0 ? ` — stall #${_stallCount}, stepping back to find fork` : ""} — fetching …`);

  // Determine fetch range:
  //   • Normal catch-up: fetch from ourHeight + 1
  //   • Fork or stall detected: step back FORK_LOOKBACK so importBlock can
  //     find the common ancestor, compute incomingTD from a known parent, and
  //     fire the reorg that switches to the heavier chain.
  //   • Peer has more work but same/lower height: always step back (classic fork)
  const fromBlock = (peerHeight > ourHeight && _stallCount === 0)
    ? ourHeight + 1
    : Math.max(1, ourHeight - FORK_LOOKBACK);

  try {
    const r = await fetch(
      `${peer}/api/sync/blocks?from=${fromBlock}&limit=500`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!r.ok) {
      console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} returned HTTP ${r.status} for blocks`);
      return;
    }

    const data = (await r.json()) as {
      blocks: Array<StoredBlock & { transactions: StoredTransaction[] }>;
    };
    if (!Array.isArray(data.blocks) || data.blocks.length === 0) return;

    for (const blockData of data.blocks) {
      const { transactions, ...block } = blockData;
      try {
        await chain.importBlock(block as StoredBlock, transactions ?? []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Reorg failed — we don't have the full fork yet, sync loop will retry
        if (msg.includes("Reorg aborted")) {
          console.warn(`[${ts()}] [sync] Reorg from ${peerShort} incomplete, will retry: ${msg}`);
          break;
        }
        // Any other unrecognised error: log and continue to next block
        if (!msg.includes("already") && !msg.includes("Reorg aborted")) {
          console.warn(`[${ts()}] [sync] importBlock #${(block as StoredBlock).number}: ${msg}`);
        }
      }
    }

    // Measure progress by actual height change — not by how many blocks we
    // called importBlock on (already-known blocks also return without throwing,
    // which used to mask stalls by resetting _stallCount prematurely).
    const newStatus = await chain.getStatus().catch(() => null);
    const nowHeight = newStatus?.height ?? ourHeight;

    if (nowHeight > ourHeight) {
      _stallCount = 0;
      console.log(`[${ts()}] [sync] ✅ Height ${ourHeight} → ${nowHeight}${nowHeight < peerHeight ? ` (${peerHeight - nowHeight} remaining)` : " 🎉 fully synced"}`);
    } else if (peerHeight > ourHeight) {
      // Height didn't change even though peer is ahead — wrong fork branch
      _stallCount++;
      console.warn(`[${ts()}] [sync] ⚠️  Stalled at ${ourHeight} (round ${_stallCount}) — will step back next round to find fork divergence`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${ts()}] [sync] ⚠️  ${peerShort} unreachable: ${msg}`);
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
