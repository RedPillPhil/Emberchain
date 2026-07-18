import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable } from "./lib/db";
import { ensureCommunityTables } from "./lib/community-db";
import { WebSocketServer } from "ws";
import { setupCommunityWS } from "./routes/community";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure DB tables exist before accepting traffic.
Promise.all([
  ensureProofsTable(),
  ensureCommunityTables(),
]).catch((err) =>
  logger.warn({ err }, "Could not ensure database tables — continuing anyway"),
);

// Use explicit http server so WebSocket can share the same port.
const server = http.createServer(app);

// WebSocket server for community live chat — mounted at /api/community/ws
const wss = new WebSocketServer({ server, path: "/api/community/ws" });
setupCommunityWS(wss);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
