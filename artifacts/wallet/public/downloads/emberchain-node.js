#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);

// lib/emberchain-node/src/node.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
var PEER_URL = arg("peer", "https://emberchain.org").replace(/\/$/, "");
var PORT = arg("port", "8545");
var DATA_DIR = path.resolve(arg("data", "./emberchain-data"));
var FORCE_SYNC = process.argv.includes("--resync");
var SNAPSHOT = path.join(DATA_DIR, "chain.json");
function log(msg) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString().slice(11, 19)}] ${msg}`);
}
function printBanner() {
  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551              \u{1F525}  Emberchain Node  \u{1F525}                 \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
  Peer   : ${PEER_URL}
  Port   : ${PORT}
  Data   : ${DATA_DIR}
`);
}
async function downloadSnapshot() {
  log(`\u{1F4E5}  Downloading chain snapshot from peer \u2026`);
  log(`    This includes the full block history + EVM state.`);
  log(`    May take a minute on a slow connection.`);
  const res = await fetch(`${PEER_URL}/api/sync/snapshot`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Snapshot download failed: HTTP ${res.status} \u2014 is ${PEER_URL} reachable?`);
  }
  const height = res.headers.get("X-Block-Height");
  const body = await res.text();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SNAPSHOT, body, "utf-8");
  log(`\u2705  Snapshot saved (${(body.length / 1024 / 1024).toFixed(1)} MB, block ${height ?? "?"})`);
}
async function main() {
  printBanner();
  if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    await downloadSnapshot();
  } else {
    try {
      const meta = JSON.parse(readFileSync(SNAPSHOT, "utf-8"));
      log(`\u{1F4C2}  Using existing snapshot (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`\u{1F4C2}  Using existing snapshot`);
    }
    log(`    Run with --resync to force a fresh download from the peer.`);
  }
  const serverMjs = path.join(__dirname, "server.mjs");
  if (!existsSync(serverMjs)) {
    console.error(`
\u274C  server.mjs not found at: ${serverMjs}`);
    console.error(`    Make sure you downloaded the full node package (not just this file).`);
    console.error(`    See https://emberchain.org/downloads for the complete package.
`);
    process.exit(1);
  }
  log(`\u{1F680}  Starting server on port ${PORT} \u2026`);
  const child = spawn(process.execPath, ["--enable-source-maps", serverMjs], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT,
      CHAIN_DATA_FILE: SNAPSHOT,
      DATABASE_URL: "",
      // no Postgres — file-only mode
      NODE_ENV: "production"
    }
  });
  child.on("error", (err) => {
    console.error(`
\u274C  Failed to start server: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  setTimeout(() => {
    console.log(`
  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
  \u2502  Node is running! Connect your wallet:                  \u2502
  \u2502                                                         \u2502
  \u2502  MetaMask \u2192 Add Network:                                \u2502
  \u2502    Network name : Emberchain                            \u2502
  \u2502    RPC URL      : http://localhost:${PORT}/api/rpc           \u2502
  \u2502    Chain ID     : 7773                                  \u2502
  \u2502    Currency     : EMBR                                  \u2502
  \u2502                                                         \u2502
  \u2502  Block explorer : http://localhost:${PORT}                   \u2502
  \u2502  Press Ctrl+C to stop.                                  \u2502
  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
`);
  }, 4e3);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}
main().catch((err) => {
  console.error("\n\u274C  Fatal error:", err.message);
  process.exit(1);
});
