#!/usr/bin/env node
/**
 * Local bridge-miner daemon — runs on YOUR PC.
 * The wallet POSTs here when you submit a bridge; this spawns the CPU miner
 * targeting the same node that received your lock tx.
 *
 * Start once (or use start-bridge-miner-daemon.ps1):
 *   node bridge-miner-daemon.mjs
 *
 * Default listen: http://127.0.0.1:19747
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.BRIDGE_MINER_PORT ?? 19747);
const HOST = process.env.BRIDGE_MINER_HOST ?? "127.0.0.1";
const LOG_DIR = path.join(__dirname, "logs");
mkdirSync(LOG_DIR, { recursive: true });

let child = null;
let currentJob = null;
let logStream = null;

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function stopMiner() {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
  if (logStream) {
    logStream.end();
    logStream = null;
  }
  currentJob = null;
}

function startMiner({ node, address, tx, threads }) {
  if (!node || !address?.startsWith("0x")) {
    throw new Error("node and address (0x…) are required");
  }

  stopMiner();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(LOG_DIR, `bridge-miner-${stamp}.log`);
  logStream = createWriteStream(logPath, { flags: "a" });

  const args = [
    path.join(__dirname, "mine-for-bridge.mjs"),
    "--node", String(node).replace(/\/+$/, ""),
    "--address", address,
  ];
  if (tx) args.push("--tx", tx);
  if (threads) args.push("--threads", String(threads));

  currentJob = { node, address, tx: tx ?? null, startedAt: new Date().toISOString(), logPath };
  logStream.write(`[daemon] starting miner ${new Date().toISOString()}\n`);
  logStream.write(`[daemon] node=${node} address=${address} tx=${tx ?? "(watch)"}\n`);

  child = spawn(process.execPath, args, {
    cwd: __dirname,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (buf) => {
    process.stdout.write(buf);
    logStream?.write(buf);
  });
  child.stderr.on("data", (buf) => {
    process.stderr.write(buf);
    logStream?.write(buf);
  });
  child.on("exit", (code) => {
    logStream?.write(`\n[daemon] miner exited code=${code}\n`);
    logStream?.end();
    logStream = null;
    child = null;
    currentJob = { ...currentJob, exitedAt: new Date().toISOString(), exitCode: code };
  });

  return currentJob;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, port: PORT });
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    json(res, 200, {
      running: !!child,
      job: currentJob,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/stop") {
    stopMiner();
    json(res, 200, { ok: true, stopped: true });
    return;
  }

  if (req.method === "POST" && req.url === "/start") {
    try {
      const body = await readBody(req);
      const job = startMiner(body);
      json(res, 200, { ok: true, job });
    } catch (err) {
      json(res, 400, { error: err.message });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`
  EmberChain bridge-miner daemon
  Listening: http://${HOST}:${PORT}
  Wallet will auto-start mining here when you submit a bridge.

  Endpoints:
    GET  /health
    GET  /status
    POST /start  { "node", "address", "tx?" }
    POST /stop
`);
});

process.on("SIGINT", () => {
  stopMiner();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stopMiner();
  server.close(() => process.exit(0));
});
