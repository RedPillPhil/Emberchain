/**
 * Centralised runtime configuration for the ember-daemon.
 * Reads from environment variables on first import; can be overridden by
 * embedded.ts before any other module initialises (Electron use-case).
 */

import os from "node:os";
import path from "node:path";

function defaultDataDir(): string {
  switch (process.platform) {
    case "win32":  return path.join(process.env.APPDATA ?? os.homedir(), "Emberchain");
    case "darwin": return path.join(os.homedir(), "Library", "Application Support", "Emberchain");
    default:       return path.join(os.homedir(), ".emberchain");
  }
}

export const daemonConfig = {
  /** Root directory for all persistent data (chain DB, peer list, chain.json). */
  dataDir: process.env.EMBER_DATA_DIR ?? defaultDataDir(),

  /** HTTP port for the RPC / REST API.  Default 8545 (standard ETH RPC port). */
  port: parseInt(process.env.EMBER_PORT ?? process.env.PORT ?? "8545", 10),

  /** Public URL announced to peers.  Optional — set to enable peer discovery. */
  nodeUrl: (process.env.NODE_URL ?? "").replace(/\/$/, ""),

  /** Comma-separated bootstrap peers. */
  seedPeers: (process.env.SEED_PEERS ?? "https://emberchain.org").split(",").map((s) => s.trim()).filter(Boolean),

  /** When true, mining endpoints return 503 immediately. */
  miningDisabled: process.env.MINING_DISABLED === "true",

  /** Hard cap on peer list size for home/desktop nodes. */
  maxPeers: parseInt(process.env.MAX_PEERS ?? "25", 10),

  /** Log level for pino. */
  logLevel: process.env.LOG_LEVEL ?? "info",
};
