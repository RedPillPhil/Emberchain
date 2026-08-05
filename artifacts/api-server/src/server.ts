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
import { ensureDexOrdersTable } from "./lib/dex-orders-db";
import { ensureLaunchTable } from "./lib/launch-db";
import { ensureLaunchDepositTable } from "./lib/launch-deposit-db";
import { ensureFeaturedTokensTable } from "./lib/dex-featured-db";
import { startBridgeRelayer, stopBridgeRelayer } from "./lib/bridge-relayer";
import { startLaunchProcessor } from "./lib/launch-processor";
import { startMiningStatusPoller } from "./lib/mining-status-cache";
import { startChainStatusPoller } from "./lib/chain-status-cache";
import {
  startChainInvadersSettler,
  stopChainInvadersSettler,
} from "./lib/chain-invaders-settler";
import { WebSocketServer } from "ws";
import { setupCommunityWS } from "./routes/community";
import { setupMmoWS } from "./routes/mmo";

export interface ServerHandle {
  server: http.Server;
  stop:   () => Promise<void>;
}

export async function startServer(port: number): Promise<ServerHandle> {
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: "/api/community/ws" });
  setupCommunityWS(wss);
  setupMmoWS(server);

  // Listen immediately so health checks pass on startup.
  await new Promise<void>((resolve, reject) => {
    server.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain API server listening");
      resolve();
    });
  });

  // DB setup and background services run after the port is open.
  Promise.all([
    ensureProofsTable(),
    ensureCommunityTables(),
    ensureBridgeTables(),
    ensureDexOrdersTable(),
    ensureLaunchTable(),
    ensureLaunchDepositTable(),
    ensureFeaturedTokensTable(),
  ])
    .catch((err) => logger.warn({ err }, "DB tables unavailable — running without DB persistence"))
    .then(() => {
      startBridgeRelayer();
      startLaunchProcessor();
    });

  // Start background mining-status poller immediately (doesn't need DB).
  // Polls READ_NODE_URL every 15 s so /api/mining/status requests are served
  // from cache instead of hitting the already-loaded mining node per request.
  startMiningStatusPoller();
  startChainStatusPoller();
  startChainInvadersSettler();

  const stop = (): Promise<void> => {
    stopBridgeRelayer();
    stopChainInvadersSettler();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
