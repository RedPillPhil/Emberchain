import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable } from "./lib/db";
import { startSyncLoop, stopSyncLoop } from "./lib/sync-loop";
import { startChainScanner, stopChainScanner } from "./lib/chain-scanner";

export interface ServerHandle {
  server: http.Server;
  stop: () => Promise<void>;
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

  // DB setup and chain bootstrap run in the background after the port is open.
  ensureProofsTable()
    .catch((err) => logger.warn({ err }, "DB tables unavailable — running file-only mode"))
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
