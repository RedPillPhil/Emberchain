/**
 * Peer registry for the Emberchain P2P network.
 *
 * Peers are persisted to PEER_LIST_FILE on disk so the node survives restarts
 * without needing to reach the original bootstrap server.
 *
 * On boot the registry is seeded from (in priority order):
 *   1. PEER_LIST_FILE  — saved peers from the previous session
 *   2. SEED_PEERS      — comma-separated list supplied by the node launcher
 *
 * Peer exchange (PEX): call exchangePeers() to ask every known peer for
 * their peer list, growing the registry organically.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

// ── Registry ──────────────────────────────────────────────────────────────────

const peers = new Set<string>();

/** Our own public URL — set via NODE_URL env var by the node launcher. */
export const MY_URL: string = (process.env.NODE_URL ?? "").replace(/\/$/, "");

/** File path for persisting the peer list across restarts. */
const PEER_LIST_FILE = (process.env.PEER_LIST_FILE ?? "").trim();

// 1. Load previously saved peers from disk
if (PEER_LIST_FILE) {
  try {
    const saved = JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")) as string[];
    for (const u of saved) {
      const clean = u.replace(/\/$/, "");
      if (clean && clean !== MY_URL) peers.add(clean);
    }
  } catch { /* file doesn't exist yet — first run */ }
}

// 2. Seed from environment (SEED_PEERS = comma-separated URLs from node launcher)
const SEED = process.env.SEED_PEERS ?? "";
for (const u of SEED.split(",").map((s) => s.trim()).filter(Boolean)) {
  const clean = u.replace(/\/$/, "");
  if (clean && clean !== MY_URL) peers.add(clean);
}

function savePeers(): void {
  if (!PEER_LIST_FILE) return;
  try {
    writeFileSync(PEER_LIST_FILE, JSON.stringify([...peers], null, 2), "utf-8");
  } catch { /* ignore write errors (read-only fs, etc.) */ }
}

export function addPeer(url: string): void {
  const clean = url.replace(/\/$/, "");
  if (!clean || clean === MY_URL) return;
  const sizeBefore = peers.size;
  peers.add(clean);
  if (peers.size !== sizeBefore) savePeers(); // only write when something changed
}

export function removePeer(url: string): void {
  peers.delete(url.replace(/\/$/, ""));
  savePeers();
}

export function getPeers(): string[] {
  return [...peers];
}

// ── Peer exchange (PEX) ───────────────────────────────────────────────────────

/**
 * Ask every known peer for their peer list and add newly discovered peers.
 * Call this on startup and periodically so the mesh grows organically.
 */
export async function exchangePeers(): Promise<void> {
  const current = getPeers();
  await Promise.allSettled(
    current.map(async (peer) => {
      try {
        const r = await fetch(`${peer}/api/sync/peers`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return;
        const data = (await r.json()) as { peers?: string[] };
        for (const p of data.peers ?? []) addPeer(p);
      } catch { /* peer offline */ }
    }),
  );
}

// ── Broadcasting ──────────────────────────────────────────────────────────────

/**
 * Pushes a newly-mined block to all known peers immediately.
 * @param excludeUrl  Peer that sent us this block — omit to avoid echo loops.
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
      } catch { /* peer offline — will catch up via polling */ }
    }),
  );
}
