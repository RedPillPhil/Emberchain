#!/usr/bin/env node
/**
 * emberd — standalone Emberchain blockchain daemon
 *
 * Usage:
 *   emberd [options]
 *
 * Options:
 *   --datadir <path>        Data directory (default: ~/.emberchain)
 *   --port <number>         HTTP/RPC port (default: 8545)
 *   --seed-peers <urls>     Comma-separated bootstrap peer URLs
 *   --node-url <url>        Public URL of this node (for peer announcements)
 *   --mine                  Enable mining on startup
 *   --miner-address <addr>  Address to receive block rewards
 *   --intensity <1-10>      Mining intensity (default: 2)
 *   --log-level <level>     Log level: trace/debug/info/warn/error (default: info)
 *   --no-sync               Disable peer sync (run isolated / dev mode)
 *   --help                  Show this help
 */

import { parseArgs } from "node:util";
import { daemonConfig } from "./lib/config.js";
import { startServer } from "./server.js";
import { logger } from "./lib/logger.js";
import { chain } from "./lib/chain.js";
import { announceSelf } from "./lib/peers.js";
import { configureSyncLoop } from "./lib/sync-loop.js";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    datadir:       { type: "string" },
    port:          { type: "string" },
    "seed-peers":  { type: "string" },
    "node-url":    { type: "string" },
    mine:          { type: "boolean", default: false },
    "miner-address": { type: "string" },
    intensity:     { type: "string" },
    "log-level":   { type: "string" },
    "no-sync":     { type: "boolean", default: false },
    help:          { type: "boolean", default: false },
    // Desktop-friendly sync flags
    "gentle-sync": { type: "boolean", default: false },
  },
  allowPositionals: false,
  strict: false,
});

if (values.help) {
  console.log(`
emberd — Standalone Emberchain Node v1.0.0

Usage: emberd [options]

Options:
  --datadir <path>          Data directory     (default: ~/.emberchain)
  --port <number>           HTTP/RPC port      (default: 8545)
  --seed-peers <urls>       Bootstrap peers    (comma-separated)
  --node-url <url>          Public URL (for peer announcements)
  --mine                    Start mining on launch
  --miner-address <addr>    Mining reward address
  --intensity <1-10>        Mining intensity   (default: 2)
  --log-level <level>       Log level          (default: info)
  --no-sync                 Disable peer sync (isolated / dev mode)
  --gentle-sync             Home-connection mode: batch sync, sequential PEX
  --help                    Print this help

MetaMask RPC URL: http://127.0.0.1:<port>
Chain ID: 7773

Examples:
  emberd --port 8545
  emberd --mine --miner-address 0xYourAddress
  emberd --datadir /mnt/fast-drive/emberchain --port 8545
`);
  process.exit(0);
}

// Apply CLI overrides to daemonConfig before any module reads it
if (values.datadir)         { daemonConfig.dataDir   = values.datadir as string; process.env.EMBER_DATA_DIR = values.datadir as string; }
if (values.port)            { daemonConfig.port      = parseInt(values.port as string, 10); }
if (values["node-url"])     { daemonConfig.nodeUrl   = (values["node-url"] as string).replace(/\/$/, ""); process.env.NODE_URL = daemonConfig.nodeUrl; }
if (values["seed-peers"])   { daemonConfig.seedPeers = (values["seed-peers"] as string).split(",").map((s) => s.trim()).filter(Boolean); process.env.SEED_PEERS = values["seed-peers"] as string; }
if (values["log-level"])    { daemonConfig.logLevel  = values["log-level"] as string; process.env.LOG_LEVEL = daemonConfig.logLevel; }

if (values["gentle-sync"]) {
  configureSyncLoop({ batchSize: 500, batchDelayMs: 5_000, skipSnapshot: true, gentlePex: true });
}

const port = daemonConfig.port;

logger.info({ port, dataDir: daemonConfig.dataDir }, "Starting emberd");

startServer(port)
  .then(async ({ server, stop }) => {
    logger.info(`
╔═══════════════════════════════════════════════╗
║        Emberchain Node  (emberd v1.0.0)        ║
╠═══════════════════════════════════════════════╣
║  RPC endpoint : http://127.0.0.1:${String(port).padEnd(5)}         ║
║  Chain ID     : 7773                          ║
║  Data dir     : ${daemonConfig.dataDir.slice(0, 27).padEnd(27)}  ║
╚═══════════════════════════════════════════════╝

Add to MetaMask:
  Network name : Emberchain
  New RPC URL  : http://127.0.0.1:${port}
  Chain ID     : 7773
  Symbol       : EMBR
`);

    // Announce self to peers if NODE_URL is set
    if (daemonConfig.nodeUrl) {
      announceSelf(daemonConfig.nodeUrl).catch(() => {});
    }

    // Start server-side mining if requested
    if (values.mine) {
      const addr = values["miner-address"] as string | undefined;
      if (!addr) { logger.error("--mine requires --miner-address"); process.exit(1); }
      const intensity = values.intensity ? parseInt(values.intensity as string, 10) : 2;
      // Wait for chain to be ready before starting mining
      setTimeout(async () => {
        try {
          await chain.startMining(addr, intensity);
          logger.info({ addr, intensity }, "Server-side mining started");
        } catch (err) {
          logger.warn({ err }, "Failed to start mining — start manually via /api/mining/start");
        }
      }, 6_000);
    }

    const shutdown = async (signal: string) => {
      logger.info({ signal }, "Shutting down emberd…");
      await stop();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));

    server.on("error", (err) => {
      logger.error({ err }, "Server error");
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to start emberd");
    process.exit(1);
  });
