#!/usr/bin/env node
/**
 * Emberchain Standalone Miner
 * ===========================
 * Single-file Node.js miner for EmberChain.
 * Uses worker_threads so every CPU core mines in parallel.
 *
 * Requirements:  Node 18+  |  npm install ethereum-cryptography
 *
 * Usage:
 *   node emberchain-miner.mjs --address 0xYOUR_ADDRESS [options]
 *
 * Options:
 *   --node      <url>   Node URL  (default: https://emberchain.org)
 *   --address   <addr>  Your EMBR wallet address  (REQUIRED)
 *   --threads   <n>     Mining threads (default: all CPU cores)
 *   --batch     <n>     Hashes per thread batch (default: 8000)
 *
 * Environment variable equivalents (CLI takes precedence):
 *   EMBR_NODE, EMBR_ADDRESS, EMBR_THREADS, EMBR_BATCH
 */

import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import os from "node:os";

// ─── keccak256 ───────────────────────────────────────────────────────────────
// We use ethereum-cryptography because Node.js crypto ships SHA3-256 (NIST),
// which is different from the pre-standard keccak256 Ethereum uses.
const require = createRequire(import.meta.url);
let keccak256;
try {
  ({ keccak256 } = require("ethereum-cryptography/keccak.js"));
} catch {
  console.error(
    "\n  ✗  ethereum-cryptography not found.\n" +
    "     Run:  npm install ethereum-cryptography\n"
  );
  process.exit(1);
}

// ─── Shared constants ────────────────────────────────────────────────────────
const MAX_TARGET = 2n ** 256n - 1n;
const __filename = fileURLToPath(import.meta.url);

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER THREAD — pure hashing loop, no I/O
// ═══════════════════════════════════════════════════════════════════════════════
if (!isMainThread) {
  const { header, startNonce, batchSize, blockTarget, shareTarget } = workerData;
  const enc = new TextEncoder();
  const target   = BigInt(blockTarget);
  const sTgt     = BigInt(shareTarget);
  let   nonce    = BigInt(startNonce);

  function hashAt(n) {
    const json = JSON.stringify({
      number:           header.number,
      parentHash:       header.parentHash,
      timestamp:        header.timestamp,
      miner:            header.miner,
      difficulty:       header.difficulty,
      transactionsRoot: header.transactionsRoot,
      nonce:            n.toString(),
    });
    const bytes = keccak256(enc.encode(json));
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    return { value, hex: "0x" + Buffer.from(bytes).toString("hex") };
  }

  let hashes = 0;
  for (;;) {
    for (let i = 0; i < batchSize; i++) {
      const { value, hex } = hashAt(nonce);
      hashes++;
      if (value <= target) {
        parentPort.postMessage({ type: "block", nonce: nonce.toString(), hash: hex, hashes });
        hashes = 0;
      } else if (value <= sTgt) {
        parentPort.postMessage({ type: "share", nonce: nonce.toString(), hash: hex, hashes });
        hashes = 0;
      }
      nonce++;
    }
    parentPort.postMessage({ type: "progress", hashes });
    hashes = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN THREAD
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CLI / env config ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, env, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : (process.env[env] ?? def);
  };
  return {
    node:    get("--node",    "EMBR_NODE",    "https://emberchain.org"),
    address: get("--address", "EMBR_ADDRESS", ""),
    threads: parseInt(get("--threads", "EMBR_THREADS", String(os.cpus().length))),
    batch:   parseInt(get("--batch",   "EMBR_BATCH",   "8000")),
  };
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────
async function getTemplate(node, address) {
  const url = `${node}/api/mining/template?minerAddress=${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Template fetch HTTP ${res.status}`);
  return res.json();
}

async function submitShare(node, address, header, nonce) {
  const res = await fetch(`${node}/api/mining/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function submitBlock(node, address, header, nonce, hash) {
  const res = await fetch(`${node}/api/mining/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minerAddress:    address,
      header,
      nonce,
      blockHash:       hash,
      pendingTxHashes: [],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ─── Display helpers ─────────────────────────────────────────────────────────
function hr(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " GH/s";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " MH/s";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + " KH/s";
  return n.toFixed(0) + " H/s";
}
function ts() {
  return new Date().toISOString().slice(11, 19);
}
function short(hex) {
  return hex ? hex.slice(0, 10) + "…" : "?";
}

// ─── Main loop ───────────────────────────────────────────────────────────────
async function mainLoop() {
  const cfg = parseArgs();

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║        EmberChain Standalone Miner           ║
  ╚══════════════════════════════════════════════╝
  Node    : ${cfg.node}
  Address : ${cfg.address || "(NOT SET — use --address 0x...)"}
  Threads : ${cfg.threads}
  Batch   : ${cfg.batch.toLocaleString()} hashes/batch/thread
`);

  if (!cfg.address || !cfg.address.startsWith("0x")) {
    console.error("  ✗  No miner address set. Pass --address 0xYOUR_ADDRESS\n");
    process.exit(1);
  }

  let workers       = [];
  let currentHeader = null;
  let currentBlock  = 0;
  let totalHashes   = 0;
  let shares        = 0;
  let blocks        = 0;
  let startTime     = Date.now();
  let stale         = false;

  // ── Stats ticker ──────────────────────────────────────────────────────────
  setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const hashrate = totalHashes / elapsed;
    process.stdout.write(
      `\r  [${ts()}]  Block ${currentBlock}  |  ${hr(hashrate)}  |  Shares: ${shares}  Blocks: ${blocks}  `
    );
  }, 2000);

  // ── Template poller ───────────────────────────────────────────────────────
  async function refreshTemplate() {
    try {
      const tpl = await getTemplate(cfg.node, cfg.address);
      const newBlock = tpl.header.number;

      if (newBlock !== currentBlock) {
        stale = true;
        currentBlock  = newBlock;
        currentHeader = tpl.header;
        console.log(`\n  [${ts()}] 🔷 New block: #${newBlock}  diff: ${BigInt(tpl.header.difficulty).toLocaleString()}  target: ${short(tpl.target)}`);
        restartWorkers(tpl);
        stale = false;
      }
    } catch (err) {
      console.error(`\n  [${ts()}] ⚠  Template fetch failed: ${err.message}`);
    }
  }

  // ── Worker management ─────────────────────────────────────────────────────
  function restartWorkers(tpl) {
    // Terminate old workers
    for (const w of workers) w.terminate();
    workers = [];

    // Spread nonce space across threads — each thread starts at a random offset
    // so threads don't duplicate work
    for (let i = 0; i < cfg.threads; i++) {
      const startNonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

      const w = new Worker(__filename, {
        workerData: {
          header:      tpl.header,
          startNonce:  startNonce.toString(),
          batchSize:   cfg.batch,
          blockTarget: tpl.target.toString(),
          shareTarget: tpl.shareTarget.toString(),
        },
      });

      w.on("message", async (msg) => {
        if (stale) return;
        totalHashes += msg.hashes ?? 0;

        if (msg.type === "block") {
          console.log(`\n  [${ts()}] 🟠 BLOCK FOUND! nonce=${msg.nonce} hash=${short(msg.hash)}`);
          const { status, body } = await submitBlock(cfg.node, cfg.address, currentHeader, msg.nonce, msg.hash);
          if (status === 200) {
            blocks++;
            console.log(`  [${ts()}] ✅ Block accepted! #${currentBlock}`);
          } else if (status === 409) {
            console.log(`  [${ts()}] ⚠  Block stale (409) — refreshing template…`);
          } else {
            console.log(`  [${ts()}] ✗  Block rejected (${status}): ${body?.error ?? JSON.stringify(body)}`);
          }
          stale = true;
          await refreshTemplate();

        } else if (msg.type === "share") {
          const { status, body } = await submitShare(cfg.node, cfg.address, currentHeader, msg.nonce);
          if (status === 200) {
            shares++;
            if (body?.blockFound) {
              blocks++;
              console.log(`\n  [${ts()}] ✅ Share was a BLOCK! Accepted #${currentBlock}`);
              stale = true;
              await refreshTemplate();
            }
          } else if (status === 409) {
            stale = true;
            await refreshTemplate();
          } else if (status === 429) {
            // Rate-limited — just skip this share
          } else {
            console.log(`\n  [${ts()}] ✗  Share rejected (${status}): ${body?.error ?? ""}`);
          }

        } else if (msg.type === "progress") {
          // totalHashes already added above
        }
      });

      w.on("error", (err) => console.error(`\n  Worker error: ${err.message}`));

      workers.push(w);
    }
  }

  // ── Kick off ──────────────────────────────────────────────────────────────
  await refreshTemplate();

  // Poll for new blocks every 5 seconds
  setInterval(refreshTemplate, 5_000);
}

mainLoop().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
