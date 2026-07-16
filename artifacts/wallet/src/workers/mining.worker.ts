/**
 * Browser mining WebWorker — runs keccak256 proof-of-work on the user's CPU.
 *
 * Ported from the working Python desktop miner:
 *   - 48-bit random starting nonce (matches Python's random.randint(0, 2**48))
 *   - Auto-refreshes template after MAX_HASHES_PER_TEMPLATE iterations
 *   - Breaks and requests a fresh template after every share submission
 *
 * Message contract
 * ─────────────────
 * Receive { type:'start', header, target, shareTarget, batchSize }  → begin grinding nonces
 * Receive { type:'stop' }                                           → halt and ack
 *
 * Send { type:'progress', hashRate, nonce, hash }  → periodic update
 * Send { type:'share', nonce }                     → nonce meets shareTarget; worker pauses for fresh template
 * Send { type:'found', nonce, blockHash }          → nonce meets block target; worker stops
 * Send { type:'needTemplate' }                     → MAX_HASHES_PER_TEMPLATE reached; worker pauses for fresh template
 * Send { type:'stopped' }                          → acknowledged stop
 */

import { keccak256 } from "ethereum-cryptography/keccak.js";

export interface WorkerHeader {
  number: number;
  parentHash: string;
  timestamp: number;
  miner: string;
  /** bigint serialised as decimal string */
  difficulty: string;
  transactionsRoot: string;
}

export type ToWorkerMsg =
  | { type: "start"; header: WorkerHeader; target: string; shareTarget: string; batchSize: number }
  | { type: "stop" };

export type FromWorkerMsg =
  | { type: "progress"; hashRate: number; nonce: string; hash: string }
  | { type: "share"; nonce: string }
  | { type: "found"; nonce: string; blockHash: string }
  | { type: "needTemplate" }
  | { type: "stopped" };

// After this many hashes on a single template, pause and request a fresh one.
// Matches the Python miner's `if hashes >= 2000000: break` behaviour.
const MAX_HASHES_PER_TEMPLATE = 2_000_000;

// ── helpers ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function encodeHeader(h: WorkerHeader, nonce: bigint): Uint8Array {
  // Must match encodeHeader() in lib/chain-core/src/mining.ts exactly.
  return enc.encode(
    JSON.stringify({
      number: h.number,
      parentHash: h.parentHash,
      timestamp: h.timestamp,
      miner: h.miner,
      difficulty: h.difficulty,      // already a decimal string
      transactionsRoot: h.transactionsRoot,
      nonce: nonce.toString(),
    }),
  );
}

function hashHeader(h: WorkerHeader, nonce: bigint): { hex: string; value: bigint } {
  const bytes = keccak256(encodeHeader(h, nonce));
  const hex =
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return { hex, value };
}

/** 48-bit random starting nonce — matches Python's random.randint(0, 2**48) */
function randomNonce(): bigint {
  // Use two 24-bit random values combined to stay within safe integer range
  const hi = Math.floor(Math.random() * 0x1000000); // 24 bits
  const lo = Math.floor(Math.random() * 0x1000000); // 24 bits
  return (BigInt(hi) << 24n) | BigInt(lo);
}

// ── message handler ───────────────────────────────────────────────────────────

let running = false;

self.onmessage = async (e: MessageEvent<ToWorkerMsg>) => {
  const msg = e.data;

  if (msg.type === "stop") {
    running = false;
    (self as unknown as Worker).postMessage({ type: "stopped" } satisfies FromWorkerMsg);
    return;
  }

  if (msg.type === "start") {
    running = true;
    const { header, batchSize } = msg;
    const blockTarget = BigInt(msg.target);
    const shareTarget = BigInt(msg.shareTarget);

    // 48-bit random start — prevents multiple browser tabs colliding on the same nonces
    let nonce = randomNonce();
    let hashCount = 0;
    let startTime = Date.now();
    let shareFound = false;
    let templateExhausted = false;

    outer:
    while (running) {
      shareFound = false;
      templateExhausted = false;

      let progressNonce = nonce.toString();
      let progressHash = "0x";

      for (let i = 0; i < batchSize; i++) {
        if (!running) break outer;
        const { hex, value } = hashHeader(header, nonce);
        hashCount++;
        progressNonce = nonce.toString();
        progressHash = hex;

        if (value <= blockTarget) {
          // Full block found — stop hashing entirely
          running = false;
          (self as unknown as Worker).postMessage({
            type: "found",
            nonce: nonce.toString(),
            blockHash: hex,
          } satisfies FromWorkerMsg);
          return;
        }

        if (value <= shareTarget) {
          // Valid share — report it, then break out to request a fresh template.
          // This matches the Python miner: after a share, the outer loop re-fetches
          // the template so the next round of work is always up-to-date.
          (self as unknown as Worker).postMessage({
            type: "share",
            nonce: nonce.toString(),
          } satisfies FromWorkerMsg);
          shareFound = true;
          nonce++;
          break;
        }

        nonce++;

        // Refresh template after MAX_HASHES_PER_TEMPLATE — matches Python's hashes >= 2000000 break
        if (hashCount >= MAX_HASHES_PER_TEMPLATE) {
          templateExhausted = true;
          break;
        }
      }

      // Report progress
      const elapsed = (Date.now() - startTime) / 1000;
      const hashRate = elapsed > 0 ? Math.round(hashCount / elapsed) : 0;
      (self as unknown as Worker).postMessage({
        type: "progress",
        hashRate,
        nonce: progressNonce,
        hash: progressHash,
      } satisfies FromWorkerMsg);

      if (shareFound || templateExhausted) {
        // Pause and ask the main thread for a fresh template.
        // Main thread will send a new 'start' message when ready.
        running = false;
        (self as unknown as Worker).postMessage({ type: "needTemplate" } satisfies FromWorkerMsg);
        return;
      }

      // Yield for a tick so the stop message can arrive before the next batch.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
};
