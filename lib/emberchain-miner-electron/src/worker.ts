/**
 * Mining worker — runs in a worker_threads Worker.
 * Bundled by scripts/bundle.mjs → worker-bundle.js
 */
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { workerData, parentPort } from "worker_threads";

const { nodeUrl, address, intensity } = workerData as {
  nodeUrl: string; address: string; intensity: number;
};

const BATCH_SIZES: Record<number, number> = {
  1:  300,
  2:  1_500,
  3:  6_000,
  4:  20_000,
  5:  60_000,
  6:  120_000,
  7:  300_000,
  8:  600_000,
  9:  1_200_000,
  10: 2_000_000,
};
const BATCH_SIZE  = BATCH_SIZES[intensity] ?? 6_000;
const MAX_PER_TPL = 10_000_000;

const enc = new TextEncoder();

interface Header {
  number: number; parentHash: string; timestamp: number;
  miner: string; difficulty: string; transactionsRoot: string;
}

function encodeHeader(h: Header, nonce: bigint): Uint8Array {
  return enc.encode(JSON.stringify({
    number: h.number, parentHash: h.parentHash, timestamp: h.timestamp,
    miner: h.miner, difficulty: h.difficulty, transactionsRoot: h.transactionsRoot,
    nonce: nonce.toString(),
  }));
}

function hashHeader(h: Header, nonce: bigint) {
  const bytes = keccak256(encodeHeader(h, nonce));
  const hex = "0x" + Buffer.from(bytes).toString("hex");
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return { hex, value };
}

function randomNonce(): bigint {
  const hi = Math.floor(Math.random() * 0x1_000_000);
  const lo = Math.floor(Math.random() * 0x1_000_000);
  return (BigInt(hi) << 24n) | BigInt(lo);
}

async function fetchTemplate() {
  const r = await fetch(`${nodeUrl}/api/mining/template?minerAddress=${address}`);
  if (!r.ok) throw new Error(`Template fetch failed: ${r.status}`);
  return r.json() as Promise<{ header: Header; target: string; shareTarget: string }>;
}

async function submitShare(header: Header, nonce: string) {
  const r = await fetch(`${nodeUrl}/api/mining/share`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce }),
  });
  return r.json() as Promise<{ accepted?: boolean; blockFound?: boolean }>;
}

async function submitBlock(header: Header, nonce: string, blockHash: string) {
  const r = await fetch(`${nodeUrl}/api/mining/submit`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: address, header, nonce, blockHash, pendingTxHashes: [] }),
  });
  if (r.status === 409) return { stale: true as const };
  return r.json() as Promise<{ number?: number }>;
}

async function fetchStatus() {
  try {
    const r = await fetch(`${nodeUrl}/api/chain/status`);
    if (r.ok) return r.json();
  } catch {}
  return null;
}

let running = true;
let totalShares = 0;
let totalBlocks = 0;

parentPort!.on("message", (msg: string) => { if (msg === "stop") running = false; });

async function mine() {
  parentPort!.postMessage({ type: "status", msg: "Connecting to node…" });

  const status = await fetchStatus();
  if (status) parentPort!.postMessage({ type: "network", data: status });

  let lastStatusFetch = Date.now();
  let miningStarted   = false;

  while (running) {
    let template: { header: Header; target: string; shareTarget: string };
    try {
      template = await fetchTemplate();
    } catch (err) {
      // Use "warn" so the UI logs it without clobbering the status line
      parentPort!.postMessage({ type: "warn", msg: (err as Error).message });
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    if (!miningStarted) {
      miningStarted = true;
      parentPort!.postMessage({ type: "mining_started" });
    }

    const { header, target, shareTarget } = template;
    const blockTarget     = BigInt(target);
    const shareTargetBig  = BigInt(shareTarget);
    let nonce             = randomNonce();
    let hashCount         = 0;
    let batchStart        = Date.now();
    let batchHashes       = 0;
    let templateDone      = false;

    while (!templateDone && running) {
      for (let i = 0; i < BATCH_SIZE && running; i++) {
        const { hex, value } = hashHeader(header, nonce);
        hashCount++;
        batchHashes++;

        if (value <= blockTarget) {
          const result = await submitBlock(header, nonce.toString(), hex);
          if (!("stale" in result)) {
            totalBlocks++;
            parentPort!.postMessage({ type: "block", number: (result as { number?: number }).number, totalBlocks });
          } else {
            parentPort!.postMessage({ type: "stale" });
          }
          templateDone = true;
          break;
        }

        if (value <= shareTargetBig) {
          submitShare(header, nonce.toString()).then(r => {
            if (r.accepted) { totalShares++; parentPort!.postMessage({ type: "share", totalShares }); }
            if (r.blockFound) { totalBlocks++; parentPort!.postMessage({ type: "block", number: undefined, totalBlocks }); }
          }).catch(() => {});
        }

        nonce++;
      }

      if (!templateDone) {
        const elapsedMs = Date.now() - batchStart;
        if (elapsedMs > 0) {
          parentPort!.postMessage({
            type: "hashrate",
            hashrate: Math.round((batchHashes / elapsedMs) * 1000),
            blockNumber: header.number,
            difficulty:  header.difficulty,
          });
          batchStart = Date.now();
          batchHashes = 0;
        }
        if (hashCount >= MAX_PER_TPL) templateDone = true;
        if (Date.now() - lastStatusFetch > 15000) {
          lastStatusFetch = Date.now();
          fetchStatus().then(s => { if (s) parentPort!.postMessage({ type: "network", data: s }); });
        }
        await new Promise(r => setImmediate(r));
      }
    }
  }

  parentPort!.postMessage({ type: "stopped" });
}

mine().catch(err => parentPort!.postMessage({ type: "error", msg: err.message }));
