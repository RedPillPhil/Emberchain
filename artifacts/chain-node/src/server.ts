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
  // Best-effort DB setup
  await ensureProofsTable().catch((err) =>
    logger.warn({ err }, "DB tables unavailable — running file-only mode"),
  );

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port }, "Emberchain chain-node listening");
      startSyncLoop();
      startChainScanner();
      resolve();
    });
  });

  const stop = (): Promise<void> => {
    stopSyncLoop();
    stopChainScanner();
    return new Promise((resolve) => server.close(() => resolve()));
  };

  return { server, stop };
}
