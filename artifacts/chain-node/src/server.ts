import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable, clearChainStateFromDB } from "./lib/db";
import { chain } from "./lib/chain";
import { startSyncLoop, stopSyncLoop } from "./lib/sync-loop";
import { startChainScanner, stopChainScanner } from "./lib/chain-scanner";
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

export async function startServer(port: number): Promise<ServerHandle> {
  const server = http.createServer(app);

  // Listen immediately so health checks pass on startup.
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain chain-node listening");
      resolve();
    });
  });

  // DB setup, optional force-resync, then normal sync loop — all in background.
  ensureProofsTable()
    .catch((err) => logger.warn({ err }, "DB tables unavailable — running file-only mode"))
    .then(() => maybeForceResync())
    .then(() => {
      startSyncLoop();
      startChainScanner();
    });

  const stop = (): Promise<void> => {
    stopSyncLoop();
    stopChainScanner();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
