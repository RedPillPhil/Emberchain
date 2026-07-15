import app from "./app";
import { logger } from "./lib/logger";
import { ensureProofsTable } from "./lib/db";

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

// Ensure replay-protection table exists before accepting traffic.
// This is a no-op if the table already exists (CREATE TABLE IF NOT EXISTS).
ensureProofsTable().catch((err) =>
  logger.warn({ err }, "Could not ensure used_payment_proofs table — continuing anyway"),
);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
