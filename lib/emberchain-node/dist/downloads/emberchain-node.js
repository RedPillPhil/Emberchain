#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);

// lib/emberchain-node/src/node.ts
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
function args(name) {
  const result = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) {
      result.push(process.argv[i + 1]);
    }
  }
  return result;
}
var PORT = arg("port", "8545");
var DATA_DIR = path.resolve(arg("data", "./emberchain-data"));
var MY_URL = arg("url", "").replace(/\/$/, "");
var FORCE_SYNC = process.argv.includes("--resync");
var SNAPSHOT = path.join(DATA_DIR, "chain.json");
var PEER_LIST_FILE = path.join(DATA_DIR, "peers.json");
var LOCAL_SNAPSHOT = arg("snapshot", "");
var HARDCODED_FALLBACKS = [
  "https://emberchain.org"
  // Community nodes — run yours with --url and submit a PR to add it here
];
function loadBootstrapPeers() {
  try {
    const file = path.join(__dirname, "bootstrap-peers.json");
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf-8")).map((u) => u.replace(/\/$/, "")).filter(Boolean);
    }
  } catch {
  }
  return [];
}
function loadSavedPeers() {
  try {
    if (existsSync(PEER_LIST_FILE)) {
      return JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")).map((u) => u.replace(/\/$/, "")).filter(Boolean);
    }
  } catch {
  }
  return [];
}
function buildBootstrapList() {
  const bundled = loadBootstrapPeers();
  const explicit = args("peer").map((u) => u.replace(/\/$/, "")).filter(Boolean);
  const saved = loadSavedPeers();
  const fallbacks = HARDCODED_FALLBACKS.map((u) => u.replace(/\/$/, ""));
  const seen = /* @__PURE__ */ new Set();
  const list = [];
  for (const u of [...bundled, ...saved, ...explicit, ...fallbacks]) {
    if (u && !seen.has(u)) {
      seen.add(u);
      list.push(u);
    }
  }
  return list;
}
function log(msg) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString().slice(11, 19)}] ${msg}`);
}
function printBanner(bootstrapPeers) {
  console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551              \u{1F525}  Emberchain Node  \u{1F525}                 \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
  Bootstrap peers : ${bootstrapPeers.slice(0, 3).join(", ")}${bootstrapPeers.length > 3 ? ` (+${bootstrapPeers.length - 3} more)` : ""}
  Port   : ${PORT}
  Data   : ${DATA_DIR}
  My URL : ${MY_URL || "(not set \u2014 pass --url https://your-public-url.com to join the gossip network)"}
`);
}
async function downloadSnapshotFromAnyPeer(peers) {
  const errors = [];
  for (const peer of peers) {
    log(`\u{1F4E5}  Trying ${peer} \u2026`);
    try {
      const res = await fetch(`${peer}/api/sync/snapshot`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3e4)
      });
      if (!res.ok) {
        errors.push(`${peer}: HTTP ${res.status}`);
        continue;
      }
      const height = res.headers.get("X-Block-Height");
      const body = await res.text();
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(SNAPSHOT, body, "utf-8");
      log(`\u2705  Snapshot saved (${(body.length / 1024 / 1024).toFixed(1)} MB, block ${height ?? "?"})`);
      return peer;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${peer}: ${msg}`);
      log(`\u26A0\uFE0F   ${peer} unreachable (${msg}) \u2014 trying next peer \u2026`);
    }
  }
  throw new Error(
    `Could not download snapshot from any peer:
${errors.map((e) => `  \u2022 ${e}`).join("\n")}

Ensure at least one peer is reachable, or run without --resync to use local data.`
  );
}
async function registerWithPeers(peers) {
  if (!MY_URL) return;
  const results = await Promise.allSettled(
    peers.map(async (peer) => {
      const r = await fetch(`${peer}/api/sync/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: MY_URL }),
        signal: AbortSignal.timeout(8e3)
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return peer;
    })
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const bad = results.filter((r) => r.status === "rejected").length;
  if (ok > 0) log(`\u{1F517}  Registered with ${ok} peer(s) \u2014 block gossip enabled`);
  if (bad > 0) log(`\u26A0\uFE0F   ${bad} peer(s) unreachable \u2014 will still sync via polling`);
}
async function bootstrapPeerExchange(peers) {
  const discovered = new Set(peers);
  discovered.delete(MY_URL);
  await Promise.allSettled(
    peers.map(async (peer) => {
      try {
        const r = await fetch(`${peer}/api/sync/peers`, {
          signal: AbortSignal.timeout(6e3)
        });
        if (!r.ok) return;
        const data = await r.json();
        for (const p of data.peers ?? []) {
          const clean = p.replace(/\/$/, "");
          if (clean && clean !== MY_URL) discovered.add(clean);
        }
      } catch {
      }
    })
  );
  if (discovered.size > 0) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(PEER_LIST_FILE, JSON.stringify([...discovered], null, 2), "utf-8");
      log(`\u{1F4BE}  Saved ${discovered.size} peer(s) to ${PEER_LIST_FILE}`);
    } catch {
    }
  }
}
async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const bootstrapPeers = buildBootstrapList();
  printBanner(bootstrapPeers);
  if (LOCAL_SNAPSHOT) {
    if (!existsSync(LOCAL_SNAPSHOT)) {
      console.error(`
\u274C  Snapshot file not found: ${LOCAL_SNAPSHOT}
`);
      process.exit(1);
    }
    mkdirSync(DATA_DIR, { recursive: true });
    const snapshotData = readFileSync(LOCAL_SNAPSHOT, "utf-8");
    writeFileSync(SNAPSHOT, snapshotData, "utf-8");
    try {
      const meta = JSON.parse(snapshotData);
      log(`\u{1F4C2}  Loaded local snapshot: ${LOCAL_SNAPSHOT} (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`\u{1F4C2}  Loaded local snapshot: ${LOCAL_SNAPSHOT}`);
    }
  } else if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    log(`\u{1F4E5}  No local chain data \u2014 downloading snapshot \u2026`);
    log(`    Will try ${bootstrapPeers.length} peer(s) in order.`);
    await downloadSnapshotFromAnyPeer(bootstrapPeers);
  } else {
    try {
      const meta = JSON.parse(readFileSync(SNAPSHOT, "utf-8"));
      log(`\u{1F4C2}  Using local snapshot (${meta.blocks?.length ?? "?"} blocks)`);
    } catch {
      log(`\u{1F4C2}  Using local snapshot`);
    }
    log(`    Run with --resync to force a fresh download.`);
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
      PEER_LIST_FILE,
      // server saves/loads its peer list here
      SEED_PEERS: bootstrapPeers.join(","),
      // all known peers at boot time
      DATABASE_URL: "",
      // no Postgres — file-only mode
      NODE_ENV: "production",
      NODE_URL: MY_URL
    }
  });
  child.on("error", (err) => {
    console.error(`
\u274C  Failed to start server: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  setTimeout(async () => {
    await registerWithPeers(bootstrapPeers);
    await bootstrapPeerExchange(bootstrapPeers);
    const walletUrl = MY_URL ? `${MY_URL}/api` : `http://localhost:${PORT}/api`;
    const explorerUrl = MY_URL || `http://localhost:${PORT}`;
    console.log(`
  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
  \u2502  \u{1F525} Emberchain Node is running!                                  \u2502
  \u2502                                                                  \u2502
  \u2502  Desktop Wallet \u2192 Settings \u2192 Node URL:                           \u2502
  \u2502    ${walletUrl.padEnd(58)}\u2502
  \u2502                                                                  \u2502
  \u2502  MetaMask \u2192 Add Network:                                         \u2502
  \u2502    Network name : Emberchain                                     \u2502
  \u2502    RPC URL      : ${(walletUrl + "/rpc").padEnd(43)}\u2502
  \u2502    Chain ID     : 7773                                           \u2502
  \u2502    Currency     : EMBR                                           \u2502
  \u2502                                                                  \u2502
  \u2502  Block explorer : ${explorerUrl.padEnd(43)}\u2502
  \u2502  Press Ctrl+C to stop.                                           \u2502
  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
  ${MY_URL ? "\u2705  Public URL set \u2014 you are a full P2P participant." : "\u2139\uFE0F   No --url set. You sync via polling. Pass --url to join the gossip network."}
`);
  }, 5e3);
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
