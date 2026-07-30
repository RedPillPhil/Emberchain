#!/usr/bin/env node
/**
 * emberchain-node — standalone Emberchain full node launcher
 *
 * Bootstraps a new node from any reachable peer (or from saved local data),
 * then starts the bundled API server. If the original bootstrap server goes
 * offline, nodes that already know each other keep the network running.
 *
 * Usage:
 *   node emberchain-node.js [options]
 *
 * Options:
 *   --peer   <url>   Bootstrap peer to sync from (default: https://emberchain.org)
 *                    Multiple --peer flags are accepted; they are tried in order.
 *   --port   <port>  Local port to listen on       (default: 8545)
 *   --data   <dir>   Data directory for chain file (default: ./emberchain-data)
 *   --url    <url>   This node's own public URL — registers with peers so you
 *                    receive block gossip in real time (optional but recommended)
 *   --resync         Force re-download snapshot even if local data exists
 */

import {
  existsSync, mkdirSync, writeFileSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

/** Collect all values for a repeated flag (e.g. --peer a --peer b). */
function args(name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) {
      result.push(process.argv[i + 1]!);
    }
  }
  return result;
}

const PORT         = arg("port", "8545");
const DATA_DIR     = path.resolve(arg("data", "./emberchain-data"));
const MY_URL       = arg("url", "").replace(/\/$/, "");
const FORCE_SYNC   = process.argv.includes("--resync");
const SNAPSHOT     = path.join(DATA_DIR, "chain.json");
const PEER_LIST_FILE = path.join(DATA_DIR, "peers.json");
// --snapshot <file>  load chain from a local file instead of downloading
const LOCAL_SNAPSHOT = arg("snapshot", "");

/**
 * Bootstrap peers — tried in this order until one works:
 *   1. bootstrap-peers.json shipped alongside this file in the download package
 *   2. Peers from saved peers.json (nodes this machine has talked to before)
 *   3. --peer flags from the command line
 *   4. Hardcoded fallbacks
 *
 * This means a fresh node can always bootstrap as long as ANY peer in
 * bootstrap-peers.json (which ships with every GitHub release) is reachable.
 */
const HARDCODED_FALLBACKS = [
  "https://emberchain.org",
  // Community nodes — run yours with --url and submit a PR to add it here
];

function loadBootstrapPeers(): string[] {
  try {
    const file = path.join(__dirname, "bootstrap-peers.json");
    if (existsSync(file)) {
      return (JSON.parse(readFileSync(file, "utf-8")) as string[])
        .map((u) => u.replace(/\/$/, ""))
        .filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
}

function loadSavedPeers(): string[] {
  try {
    if (existsSync(PEER_LIST_FILE)) {
      return (JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")) as string[])
        .map((u) => u.replace(/\/$/, ""))
        .filter(Boolean);
    }
  } catch { /* ignore */ }
  return [];
}

function buildBootstrapList(): string[] {
  const bundled  = loadBootstrapPeers();
  const explicit = args("peer").map((u) => u.replace(/\/$/, "")).filter(Boolean);
  const saved    = loadSavedPeers();
  const fallbacks = HARDCODED_FALLBACKS.map((u) => u.replace(/\/$/, ""));

  // Deduplicate: bundled (from release) → saved (from past sessions) → explicit → fallbacks
  const seen = new Set<string>();
  const list: string[] = [];
  for (const u of [...bundled, ...saved, ...explicit, ...fallbacks]) {
    if (u && !seen.has(u)) { seen.add(u); list.push(u); }
  }
  return list;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function printBanner(bootstrapPeers: string[]) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║              🔥  Emberchain Node  🔥                 ║
╚══════════════════════════════════════════════════════╝
  Bootstrap peers : ${bootstrapPeers.slice(0, 3).join(", ")}${bootstrapPeers.length > 3 ? ` (+${bootstrapPeers.length - 3} more)` : ""}
  Port   : ${PORT}
  Data   : ${DATA_DIR}
  My URL : ${MY_URL || "(not set — pass --url https://your-public-url.com to join the gossip network)"}
`);
}

/**
 * Try to download the chain snapshot from each peer in order.
 * Returns the peer URL that succeeded, or throws if all fail.
 */
async function downloadSnapshotFromAnyPeer(peers: string[]): Promise<string> {
  const errors: string[] = [];

  for (const peer of peers) {
    log(`📥  Trying ${peer} …`);
    try {
      const res = await fetch(`${peer}/api/sync/snapshot`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        errors.push(`${peer}: HTTP ${res.status}`);
        continue;
      }
      const height = res.headers.get("X-Block-Height");
      const body   = await res.text();

      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(SNAPSHOT, body, "utf-8");

      log(`✅  Snapshot saved (${(body.length / 1024 / 1024).toFixed(1)} MB, block ${height ?? "?"})`);
      return peer; // success — return the URL we used
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${peer}: ${msg}`);
      log(`⚠️   ${peer} unreachable (${msg}) — trying next peer …`);
    }
  }

  throw new Error(
    `Could not download snapshot from any peer:\n${errors.map((e) => `  • ${e}`).join("\n")}\n\n` +
    `Ensure at least one peer is reachable, or run without --resync to use local data.`,
  );
}

/**
 * After the server is running, register this node with every known peer.
 * Each peer will then gossip new blocks to us in real time.
 */
async function registerWithPeers(peers: string[]): Promise<void> {
  if (!MY_URL) return;

  const results = await Promise.allSettled(
    peers.map(async (peer) => {
      const r = await fetch(`${peer}/api/sync/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: MY_URL }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return peer;
    }),
  );

  const ok  = results.filter((r) => r.status === "fulfilled").length;
  const bad = results.filter((r) => r.status === "rejected").length;
  if (ok > 0)  log(`🔗  Registered with ${ok} peer(s) — block gossip enabled`);
  if (bad > 0) log(`⚠️   ${bad} peer(s) unreachable — will still sync via polling`);
}

/**
 * Ask every bootstrap peer for their peer list and save the union to disk.
 * This builds the local peer mesh so future restarts work without the main server.
 */
async function bootstrapPeerExchange(peers: string[]): Promise<void> {
  const discovered = new Set<string>(peers);
  discovered.delete(MY_URL);

  await Promise.allSettled(
    peers.map(async (peer) => {
      try {
        const r = await fetch(`${peer}/api/sync/peers`, {
          signal: AbortSignal.timeout(6_000),
        });
        if (!r.ok) return;
        const data = (await r.json()) as { peers?: string[] };
        for (const p of data.peers ?? []) {
          const clean = p.replace(/\/$/, "");
          if (clean && clean !== MY_URL) discovered.add(clean);
        }
      } catch { /* peer offline */ }
    }),
  );

  if (discovered.size > 0) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(PEER_LIST_FILE, JSON.stringify([...discovered], null, 2), "utf-8");
      log(`💾  Saved ${discovered.size} peer(s) to ${PEER_LIST_FILE}`);
    } catch { /* ignore */ }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const bootstrapPeers = buildBootstrapList();
  printBanner(bootstrapPeers);

  // ── 1. Snapshot ─────────────────────────────────────────────────────────────
  if (LOCAL_SNAPSHOT) {
    // --snapshot <file>: load from a local file (USB, IPFS download, etc.)
    if (!existsSync(LOCAL_SNAPSHOT)) {
      console.error(`\n❌  Snapshot file not found: ${LOCAL_SNAPSHOT}\n`);
      process.exit(1);
    }
    mkdirSync(DATA_DIR, { recursive: true });
    const snapshotData = readFileSync(LOCAL_SNAPSHOT, "utf-8");
    writeFileSync(SNAPSHOT, snapshotData, "utf-8");
    try {
      const meta = JSON.parse(snapshotData) as { blocks?: unknown[] };
      log(`📂  Loaded local snapshot: ${LOCAL_SNAPSHOT} (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`📂  Loaded local snapshot: ${LOCAL_SNAPSHOT}`);
    }
  } else if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    log(`📥  No local chain data — downloading snapshot …`);
    log(`    Will try ${bootstrapPeers.length} peer(s) in order.`);
    await downloadSnapshotFromAnyPeer(bootstrapPeers);
  } else {
    try {
      const meta = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as { blocks?: unknown[] };
      log(`📂  Using local snapshot (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`📂  Using local snapshot`);
    }
    log(`    Run with --resync to force a fresh download.`);
  }

  // ── 2. Find the bundled server ───────────────────────────────────────────────
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
      PEER_LIST_FILE:  PEER_LIST_FILE,             // server saves/loads its peer list here
      SEED_PEERS:      bootstrapPeers.join(","),   // all known peers at boot time
      DATABASE_URL:    "",                         // no Postgres — file-only mode
      NODE_ENV:        "production",
      NODE_URL:        MY_URL,
    },
  });

  child.on("error", (err) => {
    console.error(`\n❌  Failed to start server: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => process.exit(code ?? 0));

  // ── 4. Post-startup: register + peer exchange ────────────────────────────────
  setTimeout(async () => {
    // Register with all known peers so they broadcast blocks to us
    await registerWithPeers(bootstrapPeers);

    // Discover more peers by asking all bootstraps for their lists
    await bootstrapPeerExchange(bootstrapPeers);

    const walletUrl   = MY_URL ? `${MY_URL}/api` : `http://localhost:${PORT}/api`;
    const explorerUrl = MY_URL || `http://localhost:${PORT}`;
    console.log(`
  ┌──────────────────────────────────────────────────────────────────┐
  │  🔥 Emberchain Node is running!                                  │
  │                                                                  │
  │  Desktop Wallet → Settings → Node URL:                           │
  │    ${walletUrl.padEnd(58)}│
  │                                                                  │
  │  MetaMask → Add Network:                                         │
  │    Network name : Emberchain                                     │
  │    RPC URL      : ${(walletUrl + "/rpc").padEnd(43)}│
  │    Chain ID     : 7773                                           │
  │    Currency     : EMBR                                           │
  │                                                                  │
  │  Block explorer : ${explorerUrl.padEnd(43)}│
  │  Press Ctrl+C to stop.                                           │
  └──────────────────────────────────────────────────────────────────┘
  ${MY_URL
    ? "✅  Public URL set — you are a full P2P participant."
    : "ℹ️   No --url set. You sync via polling. Pass --url to join the gossip network."}
`);
  }, 5_000);

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => { child.kill(sig); });
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err.message);
  process.exit(1);
});
