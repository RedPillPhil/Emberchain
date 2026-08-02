#!/usr/bin/env node
/**
 * Emberchain Standalone Miner + node verifier
 *
 * Mine on a SPECIFIC node URL so you can confirm txs confirm on the same
 * machine that received them (emberchain.org vs duckdns, etc.).
 *
 * Bridge workflow (auto-start mining until your lock confirms):
 *   node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR...
 *   node mine-for-bridge.mjs --node https://emberchain.org --address 0xYOUR... --tx 0xHASH
 *
 * Setup: none — just run mine.ps1 (no npm install needed)
 *
 * Verify a stuck tx exists on a node, then mine there:
 *   node emberchain-miner.mjs --node https://emberchain.org --address 0xYOUR... --tx 0xSTUCK_HASH
 *
 * Check bridge history status for a nonce:
 *   node emberchain-miner.mjs --node https://emberchain.org --check-only --bridge-nonce 1785643913328 --address 0xYOUR...
 *
 * Compare two nodes (mempool / height):
 *   node emberchain-miner.mjs --compare https://emberchain.org https://emberchain.duckdns.org
 */

import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import os from "node:os";

const require = createRequire(import.meta.url);
const sha3 = require("./vendor/sha3.cjs");
/** @param {Uint8Array} data */
function keccak256(data) {
  return Uint8Array.from(sha3.keccak256.array(data));
}

const MAX_TARGET = 2n ** 256n - 1n;
const __filename = fileURLToPath(import.meta.url);

// ═══ WORKER THREAD ═══════════════════════════════════════════════════════════
if (!isMainThread) {
  const { header, startNonce, batchSize, blockTarget, shareTarget } = workerData;
  const enc = new TextEncoder();
  const target = BigInt(blockTarget);
  const sTgt = BigInt(shareTarget);
  let nonce = BigInt(startNonce);

  function hashAt(n) {
    const json = JSON.stringify({
      number: header.number,
      parentHash: header.parentHash,
      timestamp: header.timestamp,
      miner: header.miner,
      difficulty: header.difficulty,
      transactionsRoot: header.transactionsRoot,
      nonce: n.toString(),
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

// ═══ MAIN THREAD ═════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);

  if (args[0] === "--compare" && args[1] && args[2]) {
    return { mode: "compare", nodeA: args[1].replace(/\/+$/, ""), nodeB: args[2].replace(/\/+$/, "") };
  }

  const get = (flag, env, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : (process.env[env] ?? def);
  };
  const has = (flag) => args.includes(flag);

  return {
    mode: has("--check-only") ? "check" : "mine",
    node: get("--node", "EMBR_NODE", "https://emberchain.org").replace(/\/+$/, ""),
    address: get("--address", "EMBR_ADDRESS", ""),
    tx: get("--tx", "EMBR_TX", ""),
    bridgeNonce: get("--bridge-nonce", "EMBR_BRIDGE_NONCE", ""),
    threads: parseInt(get("--threads", "EMBR_THREADS", String(os.cpus().length)), 10),
    batch: parseInt(get("--batch", "EMBR_BATCH", "8000"), 10),
    untilConfirmed: has("--until-confirmed"),
    startServer: has("--start-server"),
    watchBridge: has("--watch-bridge"),
  };
}

async function fetchJson(url, init) {
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await sleep(Math.min(1000 * attempt, 5000));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

async function getChainStatus(node) {
  const { ok, body } = await fetchJson(`${node}/api/chain/status`);
  if (!ok) throw new Error(`chain/status HTTP error`);
  return body;
}

async function getTransaction(node, hash) {
  const { ok, status, body } = await fetchJson(`${node}/api/transactions/${encodeURIComponent(hash)}`);
  if (status === 404) return null;
  if (!ok) throw new Error(body?.error ?? `tx lookup failed`);
  return body;
}

async function getBridgeStatus(node, nonce) {
  const { ok, status, body } = await fetchJson(`${node}/api/bridge/status/${encodeURIComponent(nonce)}`);
  if (status === 404) return null;
  if (!ok) throw new Error(body?.error ?? `bridge status failed`);
  return body;
}

async function getBridgeHistory(node, address) {
  const { ok, body } = await fetchJson(`${node}/api/bridge/history/${encodeURIComponent(address)}`);
  if (!ok) throw new Error(body?.error ?? `bridge history failed`);
  return body;
}

async function getTemplate(node, address) {
  const { ok, body } = await fetchJson(
    `${node}/api/mining/template?minerAddress=${encodeURIComponent(address)}`,
  );
  if (!ok) throw new Error(body?.error ?? `template fetch failed`);
  return body;
}

async function submitShare(node, address, header, nonce) {
  return fetchJson(`${node}/api/mining/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce }),
  });
}

async function submitBlock(node, address, header, nonce, hash, pendingTxHashes) {
  return fetchJson(`${node}/api/mining/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minerAddress: address,
      header,
      nonce,
      blockHash: hash,
      pendingTxHashes,
    }),
  });
}

async function startServerMining(node, address, intensity = 1) {
  return fetchJson(`${node}/api/mining/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, intensity }),
  });
}

async function listRecentTxs(node, address) {
  const { ok, body } = await fetchJson(
    `${node}/api/transactions?address=${encodeURIComponent(address)}&limit=20`,
  );
  if (!ok) throw new Error(body?.error ?? "tx list failed");
  return body;
}

const LOCK_SELECTOR = "0x" + Buffer.from(
  keccak256(new TextEncoder().encode("lockEMBR(address,uint256)")),
).subarray(0, 4).toString("hex");

const BRIDGE_TO = (process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4").toLowerCase();

function isLockEmbrTx(tx) {
  if (!tx?.to || tx.to.toLowerCase() !== BRIDGE_TO) return false;
  const data = (tx.data ?? "0x").toLowerCase();
  return data.startsWith(LOCK_SELECTOR.toLowerCase());
}

async function watchForBridgeTx(node, address, existingTx) {
  console.log(`\n  [${ts()}] 👀 Watching for pending lockEMBR from ${short(address)} …`);
  console.log(`  Submit your bridge in the wallet, or pass --tx 0x…\n`);
  const seen = new Set(existingTx ? [existingTx.toLowerCase()] : []);
  for (;;) {
    try {
      const txs = await listRecentTxs(node, address);
      for (const tx of txs) {
        if (tx.status !== "pending" || !isLockEmbrTx(tx)) continue;
        const h = tx.hash.toLowerCase();
        if (seen.has(h)) continue;
        console.log(`  [${ts()}] ✓ Found pending bridge lock: ${tx.hash}`);
        return tx.hash;
      }
    } catch (err) {
      console.error(`  [${ts()}] watch error: ${err.message}`);
    }
    await sleep(2000);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTxDone(node, hash, label = "tx") {
  console.log(`\n  [${ts()}] Waiting for ${label} ${short(hash)} to confirm …`);
  for (;;) {
    const tx = await getTransaction(node, hash).catch(() => null);
    if (tx?.status === "success") {
      console.log(`  [${ts()}] ✅ ${label} CONFIRMED in block ${tx.blockNumber}`);
      return "success";
    }
    if (tx?.status === "failed") {
      console.log(`  [${ts()}] ✗ ${label} FAILED: ${tx.error ?? "unknown"}`);
      return "failed";
    }
    await sleep(2000);
  }
}

function hr(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " GH/s";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " MH/s";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + " KH/s";
  return n.toFixed(0) + " H/s";
}
function ts() { return new Date().toISOString().slice(11, 19); }
function short(hex) { return hex ? hex.slice(0, 10) + "…" : "?"; }

async function printNodeReport(label, node, { address, tx, bridgeNonce }) {
  console.log(`\n── ${label}: ${node} ──`);
  try {
    const st = await getChainStatus(node);
    console.log(`  height: ${st.height}  mempool: ${st.pendingTransactionCount}  serverMining: ${st.isMining}`);
    console.log(`  difficulty: ${st.difficulty}  avgBlockTime: ${st.avgBlockTime ?? "?"}s`);
  } catch (err) {
    console.log(`  ✗ chain/status: ${err.message}`);
    return;
  }

  if (tx) {
    try {
      const t = await getTransaction(node, tx);
      if (!t) console.log(`  ✗ tx ${short(tx)} NOT on this node`);
      else console.log(`  tx ${short(tx)}: status=${t.status} block=${t.blockNumber ?? "pending"}`);
    } catch (err) {
      console.log(`  ✗ tx lookup: ${err.message}`);
    }
  }

  if (bridgeNonce) {
    try {
      const b = await getBridgeStatus(node, bridgeNonce);
      if (!b) console.log(`  ✗ bridge #${bridgeNonce} not found on this node`);
      else console.log(`  bridge #${bridgeNonce}: status=${b.status} txSrc=${short(b.txHashSrc ?? "")}`);
    } catch (err) {
      console.log(`  ✗ bridge status: ${err.message}`);
    }
  }

  if (address) {
    try {
      const hist = await getBridgeHistory(node, address);
      const row = hist.find((e) => String(e.nonce) === String(bridgeNonce));
      if (bridgeNonce && row) {
        console.log(`  bridge history row: status=${row.status}`);
      }
    } catch { /* optional */ }
  }

  if (address) {
    try {
      const tpl = await getTemplate(node, address);
      const pending = tpl.pendingTxHashes ?? [];
      console.log(`  next template #${tpl.header.number}: ${pending.length} mempool tx(s) in block`);
      if (pending.length > 0) {
        for (const h of pending.slice(0, 5)) console.log(`    · ${h}`);
        if (pending.length > 5) console.log(`    · … +${pending.length - 5} more`);
      }
      if (tx && pending.length > 0) {
        const hit = pending.some((h) => h.toLowerCase() === tx.toLowerCase());
        console.log(hit
          ? `  ✓ YOUR TX IS IN THIS NODE'S MINING TEMPLATE`
          : `  ✗ your tx is NOT in this node's template (wrong node?)`);
      }
    } catch (err) {
      console.log(`  ✗ template: ${err.message}`);
    }
  }
}

async function compareNodes(nodeA, nodeB) {
  console.log("\n  EmberChain node comparison\n");
  await printNodeReport("Node A", nodeA, {});
  await printNodeReport("Node B", nodeB, {});
  console.log("\n  If height/mempool differ, you are hitting two different chain states.\n");
}

async function runChecks(cfg) {
  console.log("\n  EmberChain node check (no mining)\n");
  await printNodeReport("Target node", cfg.node, cfg);
  console.log("");
}

async function mainLoop() {
  const cfg = parseArgs();

  if (cfg.mode === "compare") {
    await compareNodes(cfg.nodeA, cfg.nodeB);
    return;
  }

  if (cfg.mode === "check") {
    if (!cfg.address?.startsWith("0x")) {
      console.error("  --address 0x... required for template check\n");
      process.exit(1);
    }
    await runChecks(cfg);
    return;
  }

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   EmberChain Miner (targeted node)           ║
  ╚══════════════════════════════════════════════╝
  Node    : ${cfg.node}
  Address : ${cfg.address || "(set --address 0x...)"}
  Tx      : ${cfg.tx || "(none)"}
  Threads : ${cfg.threads}
`);

  if (!cfg.address?.startsWith("0x")) {
    console.error("  ✗  Pass --address 0xYOUR_ADDRESS\n");
    process.exit(1);
  }

  if (cfg.startServer) {
    const { ok, status, body } = await startServerMining(cfg.node, cfg.address, 1);
    if (ok) {
      console.log(`  [${ts()}] ✓ Server mining started (isMining=${body.isMining})`);
    } else {
      console.log(`  [${ts()}] ⚠  Server mining/start HTTP ${status}: ${body?.error ?? JSON.stringify(body)}`);
    }
  }

  if (cfg.watchBridge && !cfg.tx) {
    cfg.tx = await watchForBridgeTx(cfg.node, cfg.address, cfg.tx);
  }

  await printNodeReport("Pre-flight", cfg.node, cfg);

  let workers = [];
  let currentHeader = null;
  let currentPending = [];
  let currentBlock = 0;
  let totalHashes = 0;
  let shares = 0;
  let blocks = 0;
  let startTime = Date.now();
  let stale = false;
  let stopMining = false;

  if (cfg.untilConfirmed && cfg.tx) {
    void waitForTxDone(cfg.node, cfg.tx, "bridge lock").then((result) => {
      stopMining = true;
      for (const w of workers) w.terminate();
      console.log(`\n  Done (${result}). Exiting.\n`);
      process.exit(result === "success" ? 0 : 1);
    });
  }

  setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const hashrate = totalHashes / Math.max(elapsed, 1);
    process.stdout.write(
      `\r  [${ts()}]  #${currentBlock}  ${hr(hashrate)}  shares:${shares}  blocks:${blocks}  templateTxs:${currentPending.length}  `,
    );
  }, 2000);

  async function refreshTemplate() {
    if (stopMining) return;
    try {
      const tpl = await getTemplate(cfg.node, cfg.address);
      const newBlock = tpl.header.number;
      currentPending = tpl.pendingTxHashes ?? [];

      if (newBlock !== currentBlock) {
        stale = true;
        currentBlock = newBlock;
        currentHeader = tpl.header;
        console.log(
          `\n  [${ts()}] 🔷 Template #${newBlock}  diff:${BigInt(tpl.header.difficulty).toLocaleString()}  mempoolTxs:${currentPending.length}`,
        );
        if (cfg.tx) {
          const hit = currentPending.some((h) => h.toLowerCase() === cfg.tx.toLowerCase());
          console.log(hit ? `  ✓ target tx in template` : `  ✗ target tx NOT in template on ${cfg.node}`);
        }
        restartWorkers(tpl);
        stale = false;
      }
    } catch (err) {
      console.error(`\n  [${ts()}] ⚠  Template: ${err.message}`);
    }
  }

  function restartWorkers(tpl) {
    for (const w of workers) w.terminate();
    workers = [];

    for (let i = 0; i < cfg.threads; i++) {
      const w = new Worker(__filename, {
        workerData: {
          header: tpl.header,
          startNonce: String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
          batchSize: cfg.batch,
          blockTarget: tpl.target.toString(),
          shareTarget: tpl.shareTarget.toString(),
        },
      });

      w.on("error", (err) => console.error(`\n  Worker error: ${err.message}`));
      w.on("message", (msg) => {
        void handleWorkerMessage(msg).catch((err) => {
          console.error(`\n  [${ts()}] ⚠  Worker handler error: ${err.message}`);
        });
      });
      workers.push(w);
    }
  }

  async function handleWorkerMessage(msg) {
    if (stale || stopMining) return;
    totalHashes += msg.hashes ?? 0;

    if (msg.type === "block") {
      console.log(`\n  [${ts()}] 🟠 BLOCK nonce=${msg.nonce} ${short(msg.hash)}`);
      try {
        const { status, body } = await submitBlock(
          cfg.node, cfg.address, currentHeader, msg.nonce, msg.hash, currentPending,
        );
        if (status === 200) {
          blocks++;
          console.log(`  [${ts()}] ✅ Block accepted #${currentBlock} (${currentPending.length} txs)`);
          if (cfg.tx) {
            const t = await getTransaction(cfg.node, cfg.tx).catch(() => null);
            if (t?.status === "success") console.log(`  [${ts()}] ✅ Target tx CONFIRMED`);
            else if (t) console.log(`  [${ts()}] Target tx still: ${t.status}`);
          }
        } else if (status === 409) {
          console.log(`  [${ts()}] ⚠  Stale block (409)`);
        } else {
          console.log(`  [${ts()}] ✗ Block rejected (${status}): ${body?.error ?? JSON.stringify(body)}`);
        }
        stale = true;
        await refreshTemplate();
      } catch (err) {
        console.error(`\n  [${ts()}] ⚠  Block submit network error: ${err.message} — retrying`);
      }
    } else if (msg.type === "share") {
      try {
        const { status, body } = await submitShare(cfg.node, cfg.address, currentHeader, msg.nonce);
        if (status === 200) {
          shares++;
          if (body?.blockFound) {
            blocks++;
            console.log(`\n  [${ts()}] ✅ Share promoted to block #${currentBlock}`);
            stale = true;
            await refreshTemplate();
          }
        } else if (status === 409) {
          stale = true;
          await refreshTemplate();
        }
      } catch (err) {
        console.error(`\n  [${ts()}] ⚠  Share submit network error: ${err.message} — continuing`);
      }
    }
  }

  await refreshTemplate();
  setInterval(refreshTemplate, 5_000);
}

mainLoop().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
