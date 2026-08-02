import { readFileSync, writeFileSync } from "node:fs";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const peers = new Set<string>();

export const MY_URL: string = (process.env.NODE_URL ?? "").replace(/\/$/, "");
const PEER_LIST_FILE = (process.env.PEER_LIST_FILE ?? "").trim();

if (PEER_LIST_FILE) {
  try {
    const saved = JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")) as string[];
    for (const u of saved) {
      const clean = u.replace(/\/$/, "");
      if (clean && clean !== MY_URL) peers.add(clean);
    }
  } catch { /* first run */ }
}

const SEED = process.env.SEED_PEERS ?? "";
for (const u of SEED.split(",").map((s) => s.trim()).filter(Boolean)) {
  const clean = u.replace(/\/$/, "");
  if (clean && clean !== MY_URL) peers.add(clean);
}

// Hard cap on peer list size.  Infinity by default (server nodes); desktop nodes
// call setMaxPeers(10) so the list stays small and peer-repolls stay cheap.
// Bootstrap/seed peers are already in the list before any cap is applied, so they
// are always retained regardless of the cap value.
let _maxPeers = Infinity;

/** Set a hard cap on the peer list size.  Call from embedded-node.ts on startup. */
export function setMaxPeers(n: number): void { _maxPeers = n; }

function savePeers(): void {
  if (!PEER_LIST_FILE) return;
  try {
    writeFileSync(PEER_LIST_FILE, JSON.stringify([...peers], null, 2), "utf-8");
  } catch { /* ignore */ }
}

export function addPeer(url: string): void {
  const clean = url.replace(/\/$/, "");
  if (!clean || clean === MY_URL) return;
  // Respect the cap — skip new peers once the list is full.
  // (Already-known peers are unaffected because Set.add is idempotent.)
  if (peers.size >= _maxPeers && !peers.has(clean)) return;
  const sizeBefore = peers.size;
  peers.add(clean);
  if (peers.size !== sizeBefore) savePeers();
}

export function removePeer(url: string): void {
  peers.delete(url.replace(/\/$/, ""));
  savePeers();
}

export function getPeers(): string[] {
  return [...peers];
}

/**
 * Standard PEX — queries all known peers in parallel.
 * Used by server/full nodes where bandwidth is not a concern.
 */
export async function exchangePeers(): Promise<void> {
  const current = getPeers();
  await Promise.allSettled(
    current.map(async (peer) => {
      try {
        const r = await fetch(`${peer}/api/sync/peers`, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) return;
        const data = (await r.json()) as { peers?: string[] };
        for (const p of data.peers ?? []) addPeer(p);
      } catch { /* peer offline */ }
    }),
  );
}

/**
 * Gentle PEX — queries peers one at a time, stops once the list is full.
 * Used by embedded desktop nodes to avoid holding multiple TCP connections
 * open simultaneously (which causes bufferbloat on home routers).
 * Each peer query is sequential with a 6-second timeout; if one peer is
 * offline we move on immediately rather than waiting for all in parallel.
 */
export async function exchangePeersSequential(): Promise<void> {
  const current = getPeers();
  for (const peer of current) {
    if (peers.size >= _maxPeers) break; // list is full — no point asking for more
    try {
      // 3-second timeout (vs 6 s for parallel PEX) — we're sequential so offline
      // peers add up; keeping the per-peer timeout short limits worst-case I/O to
      // ~30 s for a full 10-peer list (all offline), < 0.5 s when all are live.
      const r = await fetch(`${peer}/api/sync/peers`, { signal: AbortSignal.timeout(3_000) });
      if (!r.ok) continue;
      const data = (await r.json()) as { peers?: string[] };
      for (const p of data.peers ?? []) {
        if (peers.size >= _maxPeers) break;
        addPeer(p);
      }
    } catch { /* peer offline — try next */ }
  }
}

/**
 * Announce this node's own public URL to all known peers so the rest of the
 * network can discover it.  Called once after UPnP succeeds.  Sends in
 * parallel because we want the announcement to propagate quickly and we're
 * not looping — it's a one-shot burst, not an ongoing poll.
 */
export async function announceSelf(selfUrl: string): Promise<void> {
  const current = getPeers();
  if (current.length === 0) return;
  console.log(`[peers] Announcing self (${selfUrl}) to ${current.length} peer(s)…`);
  await Promise.allSettled(
    current.map(async (peer) => {
      try {
        await fetch(`${peer}/api/sync/peers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: selfUrl }),
          signal: AbortSignal.timeout(6000),
        });
      } catch { /* peer offline */ }
    }),
  );
}

/**
 * Gossip a pending transaction to all peers so miners on other nodes can
 * include it.  Without this a tx only ever lives in the mempool of the node
 * that received it and never gets mined unless that node finds the block.
 */
export async function broadcastTransaction(
  transaction: StoredTransaction,
  excludeUrl?: string,
): Promise<void> {
  const targets = getPeers().filter((p) => p !== excludeUrl);
  if (targets.length === 0) return;
  const payload = JSON.stringify({ transaction, fromPeer: MY_URL });
  await Promise.allSettled(
    targets.map(async (peer) => {
      try {
        await fetch(`${peer}/api/sync/submit-tx`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(8000),
        });
      } catch { /* peer offline */ }
    }),
  );
}

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
      } catch { /* peer offline */ }
    }),
  );
}
