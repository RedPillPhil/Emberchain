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

function savePeers(): void {
  if (!PEER_LIST_FILE) return;
  try {
    writeFileSync(PEER_LIST_FILE, JSON.stringify([...peers], null, 2), "utf-8");
  } catch { /* ignore */ }
}

export function addPeer(url: string): void {
  const clean = url.replace(/\/$/, "");
  if (!clean || clean === MY_URL) return;
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
