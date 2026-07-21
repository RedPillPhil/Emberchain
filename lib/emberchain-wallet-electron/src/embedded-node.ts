/**
 * Embedded node engine for EmberChain Desktop.
 * Wraps the api-server so it can run inside the Electron main process.
 *
 * IMPORTANT: main.js sets all env vars BEFORE require('node-engine-bundle.cjs')
 * so module-level code in chain.ts and peers.ts sees the right paths on first eval.
 */

import { startServer, type ServerHandle } from "../../../artifacts/api-server/src/server";
import { addPeer, getPeers } from "../../../artifacts/api-server/src/lib/peers";
import { triggerSync, stopSyncLoop, getBestPeerHeight } from "../../../artifacts/api-server/src/lib/sync-loop";
import { chain } from "../../../artifacts/api-server/src/lib/chain";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const BOOTSTRAP_PEERS = ["https://emberchain.org"];

let serverHandle: ServerHandle | null = null;
let embeddedPort = 17545;
let downloading = false;
let downloadError: string | null = null;
let cachedHeight = 0;
let heightTimer: ReturnType<typeof setInterval> | null = null;

export interface NodeStatus {
  running: boolean;
  downloading: boolean;
  downloadError: string | null;
  port: number;
  height: number;
  bestPeerHeight: number;
  syncProgress: number;   // 0-100
  synced: boolean;
  peerCount: number;
  peers: string[];
  connectionType: "public" | "outbound-only" | "stopped";
  myUrl: string | null;
  localUrl: string;    // http://127.0.0.1:<port>/api
  rpcUrl: string;      // http://127.0.0.1:<port>/api/rpc  (for MetaMask)
}

async function downloadSnapshot(snapshotPath: string): Promise<void> {
  for (const peer of BOOTSTRAP_PEERS) {
    try {
      console.log(`[embedded-node] Downloading chain snapshot from ${peer}…`);
      const res = await fetch(`${peer}/api/sync/snapshot`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) continue;
      const body = await res.text();
      if (body.length < 10) continue;
      writeFileSync(snapshotPath, body, "utf-8");
      const parsed = JSON.parse(body) as { blocks?: unknown[] };
      console.log(`[embedded-node] Snapshot saved (${parsed.blocks?.length ?? "?"} blocks)`);
      return;
    } catch (err) {
      console.warn(`[embedded-node] Snapshot download from ${peer} failed:`, err);
    }
  }
  console.warn("[embedded-node] No snapshot available — starting from genesis, sync will catch up");
}

export async function startEmbeddedNode(options: {
  port?: number;
  dataDir: string;
}): Promise<void> {
  if (serverHandle) return;

  embeddedPort = options.port ?? 17545;
  const { dataDir } = options;
  mkdirSync(dataDir, { recursive: true });

  const snapshotPath = path.join(dataDir, "chain.json");

  // Download chain snapshot on first run
  if (!existsSync(snapshotPath)) {
    downloading = true;
    downloadError = null;
    try {
      await downloadSnapshot(snapshotPath);
    } catch (err) {
      downloadError = err instanceof Error ? err.message : String(err);
    }
    downloading = false;
  }

  serverHandle = await startServer(embeddedPort);
  console.log(`[embedded-node] Server running on port ${embeddedPort}`);

  // Seed peers — SEED_PEERS env var is read at module-eval time (before main() sets it),
  // so we always seed manually here after the server is up.
  for (const peer of BOOTSTRAP_PEERS) addPeer(peer);
  triggerSync(); // don't wait 30 s for the first interval

  // Keep height cache fresh for status polling
  heightTimer = setInterval(async () => {
    try { const s = await chain.getStatus(); cachedHeight = s.height; } catch { /* not ready */ }
  }, 3_000);
}

export async function stopEmbeddedNode(): Promise<void> {
  if (heightTimer) { clearInterval(heightTimer); heightTimer = null; }
  if (!serverHandle) return;
  stopSyncLoop();
  await serverHandle.stop();
  serverHandle = null;
  cachedHeight = 0;
}

export function getNodeStatus(): NodeStatus {
  const localUrl = `http://127.0.0.1:${embeddedPort}/api`;
  const rpcUrl   = `http://127.0.0.1:${embeddedPort}/api/rpc`;
  const myUrl    = (process.env.NODE_URL ?? "").trim() || null;

  if (downloading) {
    return { running: false, downloading: true, downloadError: null,
      port: embeddedPort, height: 0, bestPeerHeight: 0, syncProgress: 0,
      synced: false, peerCount: 0, peers: [], connectionType: "stopped",
      myUrl: null, localUrl, rpcUrl };
  }
  if (!serverHandle) {
    return { running: false, downloading: false, downloadError,
      port: embeddedPort, height: 0, bestPeerHeight: 0, syncProgress: 0,
      synced: false, peerCount: 0, peers: [], connectionType: "stopped",
      myUrl: null, localUrl, rpcUrl };
  }

  const peers      = getPeers();
  const bestPeer   = getBestPeerHeight();
  const h          = cachedHeight;
  const syncPct    = bestPeer > 0 && h < bestPeer
    ? Math.min(99, Math.round((h / bestPeer) * 100))
    : h > 0 ? 100 : 0;
  const synced = bestPeer === 0 || h >= bestPeer;

  return {
    running: true, downloading: false, downloadError: null,
    port: embeddedPort, height: h, bestPeerHeight: bestPeer,
    syncProgress: syncPct, synced, peerCount: peers.length, peers,
    connectionType: myUrl ? "public" : "outbound-only",
    myUrl, localUrl, rpcUrl,
  };
}
