#!/usr/bin/env node
/**
 * emberchain-node — standalone Emberchain full node launcher
 *
 * This script is bundled together with server.mjs into a downloadable package.
 * It handles first-run snapshot download, then starts the bundled server.
 *
 * Usage:
 *   node emberchain-node.js [options]
 *
 * Options:
 *   --peer   <url>   Bootstrap peer to sync from  (default: https://emberchain.org)
 *   --port   <port>  Local port to listen on       (default: 8545)
 *   --data   <dir>   Data directory for chain file (default: ./emberchain-data)
 *   --resync         Force re-download snapshot even if local data exists
 *
 * After startup, connect MetaMask:
 *   Network name : Emberchain
 *   RPC URL      : http://localhost:8545/api/rpc
 *   Chain ID     : 7773
 *   Currency     : EMBR
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const PEER_URL   = arg("peer", "https://emberchain.org").replace(/\/$/, "");
const PORT       = arg("port", "8545");
const DATA_DIR   = path.resolve(arg("data", "./emberchain-data"));
const MY_URL     = arg("url", "").replace(/\/$/, "");   // e.g. https://my-server.com
const FORCE_SYNC = process.argv.includes("--resync");
const SNAPSHOT   = path.join(DATA_DIR, "chain.json");

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║              🔥  Emberchain Node  🔥                 ║
╚══════════════════════════════════════════════════════╝
  Peer   : ${PEER_URL}
  Port   : ${PORT}
  Data   : ${DATA_DIR}
  My URL : ${MY_URL || "(not set — use --url https://your-public-url.com to join the network)"}
`);
}

async function downloadSnapshot(): Promise<void> {
  log(`📥  Downloading chain snapshot from peer …`);
  log(`    This includes the full block history + EVM state.`);
  log(`    May take a minute on a slow connection.`);

  const res = await fetch(`${PEER_URL}/api/sync/snapshot`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Snapshot download failed: HTTP ${res.status} — is ${PEER_URL} reachable?`);
  }

  const height = res.headers.get("X-Block-Height");
  const body = await res.text();

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SNAPSHOT, body, "utf-8");

  log(`✅  Snapshot saved (${(body.length / 1024 / 1024).toFixed(1)} MB, block ${height ?? "?"})`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  printBanner();

  // ── 1. Snapshot ─────────────────────────────────────────────────────────────
  if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    await downloadSnapshot();
  } else {
    try {
      const meta = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as { blocks?: unknown[] };
      log(`📂  Using existing snapshot (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`📂  Using existing snapshot`);
    }
    log(`    Run with --resync to force a fresh download from the peer.`);
  }

  // ── 2. Find the bundled server ───────────────────────────────────────────────
  // In the downloadable package, server.mjs lives alongside this file.
  const serverMjs = path.join(__dirname, "server.mjs");

  if (!existsSync(serverMjs)) {
    console.error(`\n❌  server.mjs not found at: ${serverMjs}`);
    console.error(`    Make sure you downloaded the full node package (not just this file).`);
    console.error(`    See https://emberchain.org/downloads for the complete package.\n`);
    process.exit(1);
  }

  // ── 3. Launch server ─────────────────────────────────────────────────────────
  log(`🚀  Starting server on port ${PORT} …`);

  const child = spawn(process.execPath, ["--enable-source-maps", serverMjs], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT:            PORT,
      CHAIN_DATA_FILE: SNAPSHOT,
      DATABASE_URL:    "",          // no Postgres — file-only mode
      NODE_ENV:        "production",
      // P2P: let the server know its own public URL and where the seed peer is
      NODE_URL:        MY_URL,
      SEED_PEERS:      PEER_URL,
    },
  });

  child.on("error", (err) => {
    console.error(`\n❌  Failed to start server: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => process.exit(code ?? 0));

  // After the server is up, register this node with the bootstrap peer so it
  // broadcasts new blocks to us — and we to it.
  setTimeout(async () => {
    if (MY_URL) {
      try {
        const r = await fetch(`${PEER_URL}/api/sync/peers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: MY_URL }),
        });
        if (r.ok) {
          log(`🔗  Registered with peer ${PEER_URL} (we will receive block gossip)`);
        }
      } catch {
        log(`⚠️   Could not register with peer ${PEER_URL} — will still sync via polling`);
      }
    }

    const walletUrl  = MY_URL ? `${MY_URL}/api` : `http://localhost:${PORT}/api`;
    const explorerUrl = MY_URL || `http://localhost:${PORT}`;
    console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │  🔥 Emberchain Node is running!                              │
  │                                                              │
  │  Desktop Wallet → Settings → Node URL:                       │
  │    ${walletUrl.padEnd(54)}│
  │                                                              │
  │  MetaMask → Add Network:                                     │
  │    Network name : Emberchain                                 │
  │    RPC URL      : ${(walletUrl + "/rpc").padEnd(39)}│
  │    Chain ID     : 7773                                       │
  │    Currency     : EMBR                                       │
  │                                                              │
  │  Block explorer : ${explorerUrl.padEnd(39)}│
  │  Press Ctrl+C to stop.                                       │
  └──────────────────────────────────────────────────────────────┘
`);
  }, 5000);

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => { child.kill(sig); });
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err.message);
  process.exit(1);
});
