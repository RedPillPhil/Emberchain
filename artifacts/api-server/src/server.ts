/**
 * Exported server startup — allows the API server to be started programmatically
 * (e.g. from the standalone node executable) instead of only via the index.ts
 * auto-start path.
 *
 * index.ts calls startServer({ port }) for the Replit-hosted deployment.
 * The standalone executable calls it directly after UPnP and chain setup.
 */

import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable } from "./lib/db";
import { ensureCommunityTables } from "./lib/community-db";
import { ensureBridgeTables } from "./lib/bridge-db";
import { startBridgeRelayer, stopBridgeRelayer } from "./lib/bridge-relayer";
import { startChainScanner, stopChainScanner } from "./lib/chain-scanner";
import { startSyncLoop, stopSyncLoop } from "./lib/sync-loop";
import { WebSocketServer } from "ws";
import { setupCommunityWS } from "./routes/community";

export interface ServerHandle {
  server: http.Server;
  stop:   () => Promise<void>;
}

export async function startServer(port: number): Promise<ServerHandle> {
  // Best-effort DB setup — no Postgres in standalone mode, this is a no-op
  await Promise.all([
    ensureProofsTable(),
    ensureCommunityTables(),
    ensureBridgeTables(),
  ]).catch((err) =>
    logger.warn({ err }, "DB tables unavailable — running file-only mode"),
  );

  const server = http.createServer(app);
  const wss    = new WebSocketServer({ server, path: "/api/community/ws" });
  setupCommunityWS(wss);

  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain API server listening");
      startBridgeRelayer();
      startChainScanner();
      startSyncLoop();
      resolve();
    });
  });

  const stop = (): Promise<void> => {
    stopSyncLoop();
    stopBridgeRelayer();
    stopChainScanner();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
