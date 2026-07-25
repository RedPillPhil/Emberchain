/**
 * Embedded node engine for EmberChain Desktop.
 * Wraps the api-server so it can run inside the Electron main process.
 *
 * IMPORTANT: main.js sets all env vars BEFORE require('node-engine-bundle.cjs')
 * so module-level code in chain.ts and peers.ts sees the right paths on first eval.
 */

import { startServer, type ServerHandle } from "../../../artifacts/chain-node/src/server";
import { addPeer, getPeers } from "../../../artifacts/chain-node/src/lib/peers";
import { triggerSync, stopSyncLoop, getBestPeerHeight, configureSyncLoop } from "../../../artifacts/chain-node/src/lib/sync-loop";
import { chain } from "../../../artifacts/chain-node/src/lib/chain";
import { mkdirSync, existsSync, writeFileSync, createWriteStream, renameSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

// emberchain.org proxies chain-node under /chain-node — use that prefix so
// sync endpoints (/chain-node/api/sync/blocks etc.) resolve correctly.
const BOOTSTRAP_PEERS = [
  "https://emberchain.duckdns.org",
  "https://emberchain.org/chain-node",
  "https://po-w-chain.replit.app/chain-node",
];

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
        signal: AbortSignal.timeout(600_000), // 10 min — large chain
      });
      if (!res.ok || !res.body) continue;

      // Stream chunks directly to a temp file — avoids buffering the whole
      // chain JSON in RAM which caused the UI to freeze on large chains.
      const tmp = snapshotPath + ".tmp";
      const fileStream = createWriteStream(tmp);
      await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fileStream);

      // Quick sanity check before promoting
      const stats = fileStream.bytesWritten;
      if (stats < 10) { try { renameSync(tmp, tmp + ".bad"); } catch {} continue; }

      renameSync(tmp, snapshotPath);
      console.log(`[embedded-node] Snapshot saved (${(stats / 1024 / 1024).toFixed(1)} MB)`);
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

  // NOTE: We intentionally do NOT download a full chain snapshot here.
  // The old approach fetched the entire chain (~180 MB) in one HTTP request
  // which saturated home connections and made the app unusable for minutes.
  // The sync loop (configured below with batchSize=50, batchDelayMs=2000)
  // catches up in small 50-block chunks with a 2-second gap between each
  // request — roughly 0.6 Mbps peak, invisible on any modern connection.
  // A fresh install starts from genesis and catches up gradually; existing
  // installs resume from wherever they left off.

  serverHandle = await startServer(embeddedPort);
  console.log(`[embedded-node] Server running on port ${embeddedPort}`);

  // Seed peers — SEED_PEERS env var is read at module-eval time (before main() sets it),
  // so we always seed manually here after the server is up.
  for (const peer of BOOTSTRAP_PEERS) addPeer(peer);

  // Sync settings for the embedded desktop node.
  //
  // Design goals: sync noticeably fast without slowing the user's internet.
  //
  //   skipSnapshot: true  → no large one-shot download on first launch
  //   disablePex:   true  → no PEX gossip (peer list stays at 3 bootstrap nodes;
  //                          PEX would grow the list and make peer repolls slower)
  //
  //   During catch-up:
  //     500 blocks/batch × ~3 KB/block ≈ 1.5 MB per fetch
  //     2 000 ms between cycles → ~750 KB/s average during active sync
  //     Sequential peer queries (desktop mode) — one peer at a time, stops on
  //     first response — avoids the parallel-probe blast that causes bufferbloat.
  //
  //   Once synced:
  //     20 000 ms idle check interval → near-zero background traffic
  //
  // Each syncOnce() processes ONE batch then returns. The scheduler timer (2 s
  // catch-up, 20 s idle) controls the inter-request gap — no sleep inside the loop.
  configureSyncLoop({
    batchSize:      500,
    batchDelayMs:   2_000,
    idleIntervalMs: 20_000,
    skipSnapshot:   true,
    disablePex:     true,
  });
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
  // Only call synced if we actually have peers — 0 peers means we can't
  // know the real chain tip, so "height 0 == peer 0" is NOT synced.
  const synced = peers.length > 0 && h >= bestPeer;

  return {
    running: true, downloading: false, downloadError: null,
    port: embeddedPort, height: h, bestPeerHeight: bestPeer,
    syncProgress: syncPct, synced, peerCount: peers.length, peers,
    connectionType: myUrl ? "public" : "outbound-only",
    myUrl, localUrl, rpcUrl,
  };
}
