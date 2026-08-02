import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable, clearChainStateFromDB } from "./lib/db";
import { chain } from "./lib/chain";
import { startSyncLoop, stopSyncLoop } from "./lib/sync-loop";
import { startChainScanner, stopChainScanner } from "./lib/chain-scanner";
import { WebSocketServer } from "ws";
import { setupCommunityWS } from "./routes/community";
import { startBridgeAlertLoop } from "./lib/bridge-alert-loop";
import { startBridgeRelayer } from "./lib/bridge-relayer";
import { reconcileAllPendingBridges } from "./lib/bridge-reconcile";
import type { PersistedChain } from "@workspace/chain-core";

export interface ServerHandle {
  server: http.Server;
  stop: () => Promise<void>;
}

/**
 * If FORCE_RESYNC_FROM is set, wipe local chain_state and download a fresh
 * snapshot from that peer before the normal sync loop starts.  This is the
 * one-shot escape hatch for resolving a chain fork: set the env var, deploy
 * once, then remove it.
 */
async function maybeForceResync(): Promise<void> {
  const peer = process.env.FORCE_RESYNC_FROM;
  if (!peer) return;
  logger.info({ peer }, "[startup] FORCE_RESYNC_FROM set — wiping local chain and downloading snapshot");
  try {
    await clearChainStateFromDB();
    const r = await fetch(`${peer}/api/sync/snapshot`, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`Snapshot fetch HTTP ${r.status}`);
    const snapshot = await r.json() as PersistedChain;
    if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) {
      throw new Error("Empty snapshot from peer");
    }
    await chain.importSnapshot(snapshot);
    const status = await chain.getStatus();
    logger.info({ height: status.height, peer }, "[startup] Force-resync complete");
  } catch (err) {
    logger.error({ err }, "[startup] Force-resync failed — continuing with existing state");
  }
}

/**
 * Seed servers need a continuous miner or every submitted tx sits in mempool forever.
 * Blocks synced from peers do NOT include txs that only exist on this node's mempool.
 *
 * Set on the seed server (intensity 1 — do not use 4+ on production):
 *   AUTO_START_MINING=true
 *   SEED_MINER_ADDRESS=0xYourWallet
 *   MINING_INTENSITY=1   (optional, default 1)
 */
async function maybeAutoStartMining(): Promise<void> {
  if (process.env.MINING_DISABLED === "true") return;
  if (process.env.AUTO_START_MINING !== "true") return;

  const minerAddress = (process.env.SEED_MINER_ADDRESS ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(minerAddress)) {
    logger.warn("[startup] AUTO_START_MINING=true but SEED_MINER_ADDRESS is missing/invalid — skipping");
    return;
  }

  const intensity = Math.max(1, Math.min(2, Number(process.env.MINING_INTENSITY ?? "1") || 1));
  try {
    await chain.whenReady();
    const status = await chain.startMining(minerAddress, intensity);
    logger.info(
      { minerAddress, intensity, isMining: status.isMining },
      "[startup] Auto-started seed miner — required for mempool txs to confirm",
    );
  } catch (err) {
    logger.error({ err }, "[startup] Auto-start mining failed");
  }
}

export async function startServer(port: number): Promise<ServerHandle> {
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: "/api/community/ws" });
  setupCommunityWS(wss);

  // Listen immediately so health checks pass on startup.
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain chain-node listening");
      resolve();
    });
  });

  // Bridge relayer uses file-backed bridge-store — start immediately, don't wait on Postgres.
  startBridgeRelayer();

  // DB setup, optional force-resync, then normal sync loop — all in background.
  ensureProofsTable()
    .catch((err) => logger.warn({ err }, "DB tables unavailable — running file-only mode"))
    .then(() => maybeForceResync())
    .then(() => {
      startSyncLoop();
      startChainScanner();
      startBridgeAlertLoop();
      void maybeAutoStartMining();
      void chain.whenReady().then(() => reconcileAllPendingBridges()).catch((err) =>
        logger.warn({ err }, "[startup] bridge reconcile failed"),
      );
      // Re-check every 2 minutes for orphaned locks after restarts.
      setInterval(() => {
        void reconcileAllPendingBridges().catch((err) =>
          logger.warn({ err }, "[bridge-reconcile] periodic run failed"),
        );
      }, 120_000);
    });

  const stop = (): Promise<void> => {
    stopSyncLoop();
    stopChainScanner();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
