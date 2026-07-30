import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";
import { daemonConfig } from "./config.js";

const peers = new Set<string>();

export const MY_URL: string = daemonConfig.nodeUrl;

const PEER_LIST_FILE = path.join(daemonConfig.dataDir, "peers.json");

// Load persisted peer list from disk
try {
  const saved = JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")) as string[];
  for (const u of saved) {
    const clean = u.replace(/\/$/, "");
    if (clean && clean !== MY_URL) peers.add(clean);
  }
} catch { /* first run — no peer list yet */ }

// Seed peers from config
for (const u of daemonConfig.seedPeers) {
  const clean = u.replace(/\/$/, "");
  if (clean && clean !== MY_URL) peers.add(clean);
}

let _maxPeers = daemonConfig.maxPeers;

/** Override the peer cap at runtime (e.g. from Electron config). */
export function setMaxPeers(n: number): void { _maxPeers = n; }

function savePeers(): void {
  try {
    writeFileSync(PEER_LIST_FILE, JSON.stringify([...peers], null, 2), "utf-8");
  } catch { /* ignore */ }
}

export function addPeer(url: string): void {
  const clean = url.replace(/\/$/, "");
  if (!clean || clean === MY_URL) return;
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

/** Standard parallel PEX — used by server/full nodes. */
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

/** Sequential PEX — preferred for desktop/home nodes to avoid bufferbloat. */
export async function exchangePeersSequential(): Promise<void> {
  const current = getPeers();
  for (const peer of current) {
    if (peers.size >= _maxPeers) break;
    try {
      const r = await fetch(`${peer}/api/sync/peers`, { signal: AbortSignal.timeout(3_000) });
      if (!r.ok) continue;
      const data = (await r.json()) as { peers?: string[] };
      for (const p of data.peers ?? []) {
        if (peers.size >= _maxPeers) break;
        addPeer(p);
      }
    } catch { /* peer offline */ }
  }
}

/** Announce this node's public URL to all known peers. */
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
