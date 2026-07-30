import { logger } from "./lib/logger";
import { startServer } from "./server";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

startServer(port)
  .then(({ server, stop }) => {
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received — shutting down");
      await stop();
      process.exit(0);
    });
    // Keep the process alive
    server.on("error", (err) => {
      logger.error({ err }, "Server error");
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
