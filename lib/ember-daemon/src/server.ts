import http from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { chain } from "./lib/chain.js";
import { startSyncLoop, stopSyncLoop } from "./lib/sync-loop.js";
import { closeDb } from "./lib/db.js";
import type { PersistedChain } from "@workspace/chain-core";

export interface ServerHandle {
  server: http.Server;
  port: number;
  stop: () => Promise<void>;
}

async function maybeForceResync(): Promise<void> {
  const peer = process.env.FORCE_RESYNC_FROM;
  if (!peer) return;
  logger.info({ peer }, "[startup] FORCE_RESYNC_FROM set — wiping local chain and downloading snapshot");
  try {
    const r = await fetch(`${peer}/api/sync/snapshot`, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`Snapshot fetch HTTP ${r.status}`);
    const snapshot = await r.json() as PersistedChain;
    if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) throw new Error("Empty snapshot");
    await chain.importSnapshot(snapshot);
    const status = await chain.getStatus();
    logger.info({ height: status.height, peer }, "[startup] Force-resync complete");
  } catch (err) {
    logger.error({ err }, "[startup] Force-resync failed — continuing with existing state");
  }
}

export async function startServer(port: number): Promise<ServerHandle> {
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain daemon listening on 127.0.0.1");
      resolve();
    });
  });

  // Kick off optional resync and sync loop in background
  maybeForceResync()
    .then(() => { startSyncLoop(); })
    .catch((err) => logger.warn({ err }, "Startup resync failed — sync loop starting anyway"));

  const stop = (): Promise<void> => {
    stopSyncLoop();
    closeDb();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, port, stop };
}
