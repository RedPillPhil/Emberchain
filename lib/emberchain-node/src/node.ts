#!/usr/bin/env node
/**
 * emberchain-node setup & launcher
 *
 * Downloads the chain snapshot from a production peer and starts a local
 * Emberchain node (the full api-server) pointing at that snapshot.
 *
 * Usage:
 *   pnpm --filter @workspace/emberchain-node run node -- \
 *     --peer  https://emberchain.org \
 *     --port  8545 \
 *     --data  ./node-data
 *
 * What this does:
 *   1. Downloads the full chain snapshot from <peer>/api/sync/snapshot
 *   2. Saves it to <data>/chain.json
 *   3. Starts the api-server process with CHAIN_DATA_FILE pointing at that file
 *      and DATABASE_URL="" (file-only mode — no Postgres required)
 *
 * After startup, add to MetaMask:
 *   Network name : Emberchain (local)
 *   RPC URL      : http://localhost:<port>/api/rpc
 *   Chain ID     : 7773
 *   Currency     : EMBR
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..");

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const PEER_URL   = arg("peer",  "https://emberchain.org").replace(/\/$/, "");
const PORT       = arg("port",  "8545");
const DATA_DIR   = path.resolve(arg("data",  "./node-data"));
const SNAPSHOT   = path.join(DATA_DIR, "chain.json");
const FORCE_SYNC = process.argv.includes("--resync");

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function downloadSnapshot(): Promise<void> {
  log(`📥  Downloading snapshot from ${PEER_URL}/api/sync/snapshot …`);
  log(`    (Includes full block history + EVM state — may take a moment)`);

  const res = await fetch(`${PEER_URL}/api/sync/snapshot`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const height = res.headers.get("X-Block-Height");
  if (height) log(`    Peer is at block ${height}`);

  const body = await res.text();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SNAPSHOT, body, "utf-8");
  log(`✅  Snapshot saved → ${SNAPSHOT}`);
}

async function main() {
  console.log("\n🔥  Emberchain Node");
  console.log(`    Peer   : ${PEER_URL}`);
  console.log(`    Port   : ${PORT}`);
  console.log(`    Data   : ${DATA_DIR}\n`);

  // ── 1. Snapshot ─────────────────────────────────────────────────────────────
  if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    await downloadSnapshot();
  } else {
    log(`📂  Using existing snapshot at ${SNAPSHOT}`);
    log(`    Run with --resync to force a fresh download`);
  }

  // ── 2. Start api-server ──────────────────────────────────────────────────────
  log("🚀  Starting api-server …");

  const apiServerDir = path.join(WORKSPACE_ROOT, "artifacts", "api-server");

  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "dev"],
    {
      cwd: WORKSPACE_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: PORT,
        CHAIN_DATA_FILE: SNAPSHOT,
        DATABASE_URL: "",   // file-only mode — no Postgres required
      },
    },
  );

  child.on("error", (err) => {
    console.error(`\n❌  Failed to start api-server: ${err.message}`);
    console.error(`    Make sure you've run 'pnpm install' from the repo root.`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) process.exit(code ?? 1);
  });

  // Print MetaMask setup instructions after 3 seconds (let server start first)
  setTimeout(() => {
    console.log(`\n  ┌──────────────────────────────────────────────────────┐`);
    console.log(`  │  Add to MetaMask:                                    │`);
    console.log(`  │    Network name : Emberchain (local)                 │`);
    console.log(`  │    RPC URL      : http://localhost:${PORT}/api/rpc        │`);
    console.log(`  │    Chain ID     : 7773                               │`);
    console.log(`  │    Currency     : EMBR                               │`);
    console.log(`  └──────────────────────────────────────────────────────┘\n`);
  }, 3000);

  // Forward signals so the child process shuts down cleanly
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => child.kill(sig));
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
