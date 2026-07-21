/**
 * Autonomous peer-sync loop.
 *
 * Runs independently of the bootstrap server — once started, this loop
 * keeps any Emberchain node in sync purely by polling its known peers.
 * If the main server (emberchain.org) disappears, nodes that know each
 * other continue exchanging blocks and the network keeps running.
 *
 * Two intervals:
 *   SYNC_INTERVAL_MS  (default 30 s) — pull new blocks from a random peer
 *   PEX_INTERVAL_MS   (default 5 min) — ask all peers for their peer lists
 */

import { chain } from "./chain";
import { getPeers, exchangePeers, addPeer } from "./peers";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const SYNC_INTERVAL_MS = 30_000;
const PEX_INTERVAL_MS  = 5 * 60_000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let pexTimer:  ReturnType<typeof setInterval> | null = null;

// ── Block sync ────────────────────────────────────────────────────────────────

async function syncOnce(): Promise<void> {
  const peers = getPeers();
  if (peers.length === 0) return;

  // Pick a random peer each round for load distribution
  const peer = peers[Math.floor(Math.random() * peers.length)]!;

  let ourHeight: number;
  try {
    const status = await chain.getStatus();
    ourHeight = status.height;
  } catch {
    return; // chain not ready yet
  }

  try {
    const r = await fetch(
      `${peer}/api/sync/blocks?from=${ourHeight + 1}&limit=200`,
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
        // 409-like: already have it or too far ahead — stop importing this batch
        if (msg.includes("does not extend") || msg.includes("too far ahead")) break;
        // Any other error: skip this block and log
        console.warn(`[sync-loop] importBlock #${(block as StoredBlock).number}: ${msg}`);
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

  console.log("[sync-loop] Started — syncing from peers every 30 s, PEX every 5 min");
}

export function stopSyncLoop(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (pexTimer)  { clearInterval(pexTimer);  pexTimer  = null; }
}
