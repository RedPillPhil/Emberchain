/**
 * Browser mining WebWorker — runs keccak256 proof-of-work on the user's CPU.
 *
 * Uses the exact same encoding as lib/chain-core/src/mining.ts so hashes are
 * bit-for-bit compatible with the server validator.
 *
 * Message contract
 * ─────────────────
 * Receive { type:'start', header, target, shareTarget, batchSize }  → begin grinding nonces
 * Receive { type:'stop' }                                           → halt and ack
 *
 * Send { type:'progress', hashRate, nonce, hash }  → periodic update
 * Send { type:'share', nonce }                     → nonce meets shareTarget (not block target)
 * Send { type:'found', nonce, blockHash }          → nonce meets block target
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
  | { type: "stopped" };

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
    const blockTarget  = BigInt(msg.target);
    const shareTarget  = BigInt(msg.shareTarget);

    let nonce = BigInt(Math.floor(Math.random() * 1_000_000));
    let hashCount = 0;
    let startTime = Date.now();

    while (running) {
      let progressNonce = nonce.toString();
      let progressHash = "0x";

      for (let i = 0; i < batchSize; i++) {
        if (!running) break;
        const { hex, value } = hashHeader(header, nonce);
        hashCount++;
        progressNonce = nonce.toString();
        progressHash = hex;

        if (value <= blockTarget) {
          // Full block found — stop hashing
          running = false;
          (self as unknown as Worker).postMessage({
            type: "found",
            nonce: nonce.toString(),
            blockHash: hex,
          } satisfies FromWorkerMsg);
          return;
        }

        if (value <= shareTarget) {
          // Valid share (easier than block target) — report but keep hashing
          (self as unknown as Worker).postMessage({
            type: "share",
            nonce: nonce.toString(),
          } satisfies FromWorkerMsg);
        }

        nonce++;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const hashRate = elapsed > 0 ? Math.round(hashCount / elapsed) : 0;
      (self as unknown as Worker).postMessage({
        type: "progress",
        hashRate,
        nonce: progressNonce,
        hash: progressHash,
      } satisfies FromWorkerMsg);

      // Yield for a tick so the stop message can arrive before the next batch.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
};
