#!/usr/bin/env node
/**
 * emberchain-node — standalone self-contained Emberchain full node.
 *
 * Packaged as a native executable (.exe / linux binary / mac binary) using
 * @yao-pkg/pkg so users need no Node.js install at all.
 *
 * Startup sequence:
 *   1. Parse CLI args
 *   2. Try UPnP — automatically map the port on the home router and get
 *      the public IP so this node is reachable without manual port-forwarding
 *   3. Download chain snapshot from a peer (or load from local data)
 *   4. Start the Emberchain API server in-process
 *   5. Register with bootstrap peers so they push new blocks to us
 *   6. Do a peer-exchange round to grow the local mesh
 *
 * Usage:
 *   emberchain-node[.exe]              # auto-UPnP, port 8545
 *   emberchain-node --port 8546        # different port
 *   emberchain-node --no-upnp          # skip UPnP (outbound-only)
 *   emberchain-node --url http://x.x.x.x:8545   # manual public URL (overrides UPnP)
 *   emberchain-node --resync           # force re-download of chain
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path     from "node:path";
import { URL }  from "node:url";

import { tryUPnP }    from "./upnp";
import { startServer } from "../../../artifacts/api-server/src/server";

// ── CLI args ──────────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}
function args(name: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) result.push(process.argv[i + 1]!);
  }
  return result;
}

const PORT          = parseInt(arg("port", "8545"), 10);
const DATA_DIR      = path.resolve(arg("data", "./emberchain-data"));
const MANUAL_URL    = arg("url", "").replace(/\/$/, "");
const FORCE_SYNC    = process.argv.includes("--resync");
const NO_UPNP       = process.argv.includes("--no-upnp");
const LOCAL_SNAP    = arg("snapshot", "");
const SNAPSHOT      = path.join(DATA_DIR, "chain.json");
const PEER_LIST_FILE = path.join(DATA_DIR, "peers.json");

const HARDCODED_FALLBACKS = ["https://emberchain.org"];

function loadBootstrapPeers(): string[] {
  const sources: string[] = [];
  // 1. bootstrap-peers.json bundled alongside this executable
  try {
    // __dirname works in pkg virtual FS; resolve relative to executable directory
    const bundledPath = path.join(
      typeof __dirname !== "undefined" ? __dirname : path.dirname(process.execPath),
      "bootstrap-peers.json",
    );
    if (existsSync(bundledPath)) {
      const list = JSON.parse(readFileSync(bundledPath, "utf-8")) as string[];
      sources.push(...list.map((u) => u.replace(/\/$/, "")).filter(Boolean));
    }
  } catch { /* not bundled */ }
  // 2. Saved peers from previous sessions
  try {
    if (existsSync(PEER_LIST_FILE)) {
      const saved = JSON.parse(readFileSync(PEER_LIST_FILE, "utf-8")) as string[];
      sources.push(...saved.map((u) => u.replace(/\/$/, "")).filter(Boolean));
    }
  } catch { /* ignore */ }
  // 3. --peer flags
  sources.push(...args("peer").map((u) => u.replace(/\/$/, "")).filter(Boolean));
  // 4. Hardcoded fallbacks
  sources.push(...HARDCODED_FALLBACKS);
  // Deduplicate
  const seen = new Set<string>();
  return sources.filter((u) => u && !seen.has(u) && seen.add(u));
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ── Snapshot download ─────────────────────────────────────────────────────────

async function downloadSnapshot(peers: string[]): Promise<void> {
  const errors: string[] = [];
  for (const peer of peers) {
    log(`📥  Trying ${peer} …`);
    try {
      const res = await fetch(`${peer}/api/sync/snapshot`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) { errors.push(`${peer}: HTTP ${res.status}`); continue; }
      const height = res.headers.get("X-Block-Height");
      const body   = await res.text();
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(SNAPSHOT, body, "utf-8");
      log(`✅  Chain snapshot saved (${(body.length / 1024 / 1024).toFixed(1)} MB, block ${height ?? "?"})`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${peer}: ${msg}`);
      log(`⚠️   ${peer} unreachable — trying next …`);
    }
  }
  throw new Error(`Could not download snapshot:\n${errors.map((e) => `  • ${e}`).join("\n")}`);
}

// ── Peer registration ─────────────────────────────────────────────────────────

async function registerWithPeers(myUrl: string, peers: string[]): Promise<void> {
  if (!myUrl) return;
  const results = await Promise.allSettled(
    peers.map(async (peer) => {
      const r = await fetch(`${peer}/api/sync/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: myUrl }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );
  const ok  = results.filter((r) => r.status === "fulfilled").length;
  const bad = results.filter((r) => r.status === "rejected").length;
  if (ok > 0)  log(`🔗  Registered with ${ok} peer(s) — real-time block gossip enabled`);
  if (bad > 0) log(`⚠️   ${bad} peer(s) offline — will sync via 30 s polling`);
}

async function bootstrapPeerExchange(myUrl: string, peers: string[]): Promise<void> {
  const discovered = new Set<string>(peers);
  if (myUrl) discovered.delete(myUrl);
  await Promise.allSettled(
    peers.map(async (peer) => {
      try {
        const r = await fetch(`${peer}/api/sync/peers`, { signal: AbortSignal.timeout(6_000) });
        if (!r.ok) return;
        const data = (await r.json()) as { peers?: string[] };
        for (const p of data.peers ?? []) {
          const clean = p.replace(/\/$/, "");
          if (clean && clean !== myUrl) discovered.add(clean);
        }
      } catch { /* offline */ }
    }),
  );
  if (discovered.size > 0) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(PEER_LIST_FILE, JSON.stringify([...discovered], null, 2), "utf-8");
      log(`💾  Saved ${discovered.size} peer(s) for next startup`);
    } catch { /* ignore */ }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════╗
║              🔥  Emberchain Node  🔥                 ║
╚══════════════════════════════════════════════════════╝
  Port   : ${PORT}
  Data   : ${DATA_DIR}
`);

  mkdirSync(DATA_DIR, { recursive: true });
  const bootstrapPeers = loadBootstrapPeers();

  // ── 1. UPnP — try to become publicly reachable automatically ────────────────
  let myUrl = MANUAL_URL;

  if (!myUrl && !NO_UPNP) {
    log("🔍  Trying UPnP to open port automatically …");
    const upnp = await tryUPnP(PORT);
    if (upnp.mapped && upnp.externalIp) {
      myUrl = `http://${upnp.externalIp}:${upnp.externalPort ?? PORT}`;
      log(`✅  UPnP success — this node is publicly reachable at ${myUrl}`);
    } else {
      log(`ℹ️   UPnP unavailable (${upnp.reason})`);
      log(`    Node will sync via outbound connections only.`);
      log(`    To become publicly reachable: enable UPnP in your router, or pass --url http://YOUR_IP:${PORT}`);
    }
  } else if (myUrl) {
    log(`🌐  Public URL set manually: ${myUrl}`);
  } else {
    log(`ℹ️   UPnP skipped (--no-upnp). Running in outbound-only mode.`);
  }

  // ── 2. Chain snapshot ────────────────────────────────────────────────────────
  if (LOCAL_SNAP) {
    if (!existsSync(LOCAL_SNAP)) {
      console.error(`\n❌  Snapshot file not found: ${LOCAL_SNAP}\n`);
      process.exit(1);
    }
    writeFileSync(SNAPSHOT, readFileSync(LOCAL_SNAP));
    log(`📂  Loaded local snapshot: ${LOCAL_SNAP}`);
  } else if (!existsSync(SNAPSHOT) || FORCE_SYNC) {
    log(`    Connecting to bootstrap peers …`);
    await downloadSnapshot(bootstrapPeers);
  } else {
    try {
      const meta = JSON.parse(readFileSync(SNAPSHOT, "utf-8")) as { blocks?: unknown[] };
      log(`📂  Using local chain data (${meta.blocks?.length ?? "?"} blocks) — use --resync to refresh`);
    } catch {
      log(`📂  Using local chain data`);
    }
  }

  // ── 3. Set env vars before starting the server ───────────────────────────────
  // These are read by the api-server modules when they first load.
  process.env.PORT            = String(PORT);
  process.env.CHAIN_DATA_FILE = SNAPSHOT;
  process.env.PEER_LIST_FILE  = PEER_LIST_FILE;
  process.env.SEED_PEERS      = bootstrapPeers.join(",");
  process.env.DATABASE_URL    = "";           // file-only mode — no Postgres
  process.env.NODE_ENV        = "production";
  process.env.NODE_URL        = myUrl;

  // ── 4. Start the API server in-process ──────────────────────────────────────
  log(`🚀  Starting Emberchain API server on port ${PORT} …`);
  const { stop } = await startServer(PORT);
  log(`✅  Server is running.`);

  // ── 5. Register with peers + peer exchange ───────────────────────────────────
  await registerWithPeers(myUrl, bootstrapPeers);
  await bootstrapPeerExchange(myUrl, bootstrapPeers);

  // ── 6. Banner ────────────────────────────────────────────────────────────────
  const rpcUrl      = myUrl ? `${myUrl}/api/rpc` : `http://localhost:${PORT}/api/rpc`;
  const explorerUrl = myUrl || `http://localhost:${PORT}`;
  console.log(`
  ┌──────────────────────────────────────────────────────────────────┐
  │  🔥 Emberchain Node is running!                                  │
  │                                                                  │
  │  MetaMask → Add Network:                                         │
  │    Network name : Emberchain                                     │
  │    RPC URL      : ${rpcUrl.padEnd(43)}│
  │    Chain ID     : 7773                                           │
  │    Currency     : EMBR                                           │
  │                                                                  │
  │  Block explorer : ${explorerUrl.padEnd(43)}│
  │  Press Ctrl+C to stop.                                           │
  └──────────────────────────────────────────────────────────────────┘
  ${myUrl
    ? `✅  PUBLIC NODE — you are helping keep the Emberchain network alive.\n     Other nodes will connect to you and sync from you.`
    : `⚠️   OUTBOUND-ONLY — you are syncing but not publicly reachable.\n     Enable UPnP in your router settings for full participation.`}
`);

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      log("Shutting down …");
      await stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
