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
 */

import { chain } from "./chain";
import { getPeers, exchangePeers } from "./peers";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const SYNC_INTERVAL_MS = 30_000;
const PEX_INTERVAL_MS  = 5 * 60_000;

// How many blocks to look back when searching for a fork divergence point
const FORK_LOOKBACK = 64;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let pexTimer:  ReturnType<typeof setInterval> | null = null;

// ── Block sync ────────────────────────────────────────────────────────────────

async function syncOnce(): Promise<void> {
  const peers = getPeers();
  if (peers.length === 0) return;

  // Pick a random peer each round for load distribution
  const peer = peers[Math.floor(Math.random() * peers.length)]!;

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
      if (ps.latestBlock != null)   peerHeight = ps.latestBlock;
      if (ps.totalDifficulty)       peerTD     = BigInt(ps.totalDifficulty);
    }
  } catch {
    // Peer may be offline or running an older version without totalDifficulty —
    // fall back to height-only comparison
    peerTD = peerHeight > ourHeight ? ourTD + 1n : ourTD;
  }

  // Skip if the peer has no more work than us
  if (peerTD <= ourTD && peerHeight <= ourHeight) return;

  // Determine fetch range:
  //   • Peer is simply ahead  → fetch from ourHeight + 1 (normal catch-up)
  //   • Peer has more work but same/lower height → competing fork detected;
  //     back up FORK_LOOKBACK blocks to find the divergence point
  const fromBlock = peerHeight > ourHeight
    ? ourHeight + 1
    : Math.max(1, ourHeight - FORK_LOOKBACK);

  try {
    const r = await fetch(
      `${peer}/api/sync/blocks?from=${fromBlock}&limit=200`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!r.ok) return;

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
          console.warn(`[sync-loop] Reorg from ${peer} incomplete, will retry: ${msg}`);
          break;
        }
        // Any other unrecognised error: log and continue to next block
        if (!msg.includes("already") && !msg.includes("Reorg aborted")) {
          console.warn(`[sync-loop] importBlock #${(block as StoredBlock).number}: ${msg}`);
        }
      }
    }
  } catch { /* peer offline — next interval will try a different one */ }
}

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
