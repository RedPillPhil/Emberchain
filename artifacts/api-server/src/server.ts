/**
 * API server startup — web layer only.
 *
 * After the chain-node refactor, api-server no longer owns the Blockchain
 * instance. Chain operations are proxied to chain-node via chain-client.
 *
 * Responsibilities kept here:
 *   - Express HTTP server
 *   - WebSocket community chat
 *   - Bridge relayer (calls chain-node via chain-client for EMBR chain ops)
 *   - PostgreSQL table setup for community/bridge/proof data
 */

import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable } from "./lib/db";
import { ensureCommunityTables } from "./lib/community-db";
import { ensureBridgeTables } from "./lib/bridge-db";
import { startBridgeRelayer, stopBridgeRelayer } from "./lib/bridge-relayer";
import { WebSocketServer } from "ws";
import { setupCommunityWS } from "./routes/community";

export interface ServerHandle {
  server: http.Server;
  stop:   () => Promise<void>;
}

export async function startServer(port: number): Promise<ServerHandle> {
  await Promise.all([
    ensureProofsTable(),
    ensureCommunityTables(),
    ensureBridgeTables(),
  ]).catch((err) =>
    logger.warn({ err }, "DB tables unavailable — running without DB persistence"),
  );

  const server = http.createServer(app);
  const wss    = new WebSocketServer({ server, path: "/api/community/ws" });
  setupCommunityWS(wss);

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain API server listening");
      startBridgeRelayer();
      resolve();
    });
  });

  const stop = (): Promise<void> => {
    stopBridgeRelayer();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
