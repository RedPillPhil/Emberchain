/**
 * Peer registry for the Emberchain P2P network.
 *
 * Nodes register themselves here so that when a block is mined locally,
 * it gets broadcast to all known peers.  Peers discovered via
 * /api/sync/submit-block are added automatically (gossip learning).
 *
 * Persistence: in-memory only (peers re-register on each restart).
 * The SEED_PEERS env var pre-populates the registry on boot.
 */

import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

// ── Registry ──────────────────────────────────────────────────────────────────

const peers = new Set<string>();

/** Our own public URL — set via NODE_URL env var by the node launcher.
 *  Included in gossip payloads so recipients don't echo back to us. */
export const MY_URL: string = (process.env.NODE_URL ?? "").replace(/\/$/, "");

// Seed from environment (comma-separated list of peer URLs)
const SEED = process.env.SEED_PEERS ?? "";
for (const u of SEED.split(",").map((s) => s.trim()).filter(Boolean)) {
  peers.add(u.replace(/\/$/, ""));
}

export function addPeer(url: string): void {
  const clean = url.replace(/\/$/, "");
  if (clean && clean !== MY_URL) peers.add(clean);
}

export function removePeer(url: string): void {
  peers.delete(url.replace(/\/$/, ""));
}

export function getPeers(): string[] {
  return [...peers];
}

// ── Broadcasting ──────────────────────────────────────────────────────────────

/**
 * Pushes a newly-mined block to all known peers.
 *
 * @param block        The completed block.
 * @param transactions Full transaction records included in the block.
 * @param excludeUrl   Peer that sent us this block — skip to avoid loops.
 */
export async function broadcastBlock(
  block: StoredBlock,
  transactions: StoredTransaction[],
  excludeUrl?: string,
): Promise<void> {
  const targets = getPeers().filter((p) => p !== excludeUrl);
  if (targets.length === 0) return;

  const payload = JSON.stringify({ block, transactions, fromPeer: MY_URL });

  await Promise.allSettled(
    targets.map(async (peer) => {
      try {
        await fetch(`${peer}/api/sync/submit-block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        // Peer offline or unreachable — silently skip.
        // The peer will re-sync via /api/sync/blocks on next poll.
      }
    }),
  );
}
