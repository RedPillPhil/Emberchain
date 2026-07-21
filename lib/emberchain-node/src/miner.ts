#!/usr/bin/env node
/**
 * emberchain-miner — standalone CLI miner for Emberchain
 *
 * Usage:
 *   pnpm --filter @workspace/emberchain-node run miner -- \
 *     --node https://emberchain.org \
 *     --address 0xYourAddress \
 *     --intensity 3
 *
 * Or after a global install:
 *   emberchain-miner --node https://emberchain.org --address 0x... --intensity 3
 *
 * The miner uses the same keccak256 proof-of-work as the browser worker.
 * It fetches a block template from the node, grinds nonces, and submits
 * winning nonces back. Shares are submitted for proportional reward credit.
 *
 * Arguments:
 *   --node       Base URL of any Emberchain node (default: https://emberchain.org)
 *   --address    0x… miner address that receives block rewards
 *   --intensity  1–5 (default: 3). Higher = more CPU, more hashes/sec.
 *   --shares     Submit shares in addition to full blocks (default: true)
 */

import { keccak256 } from "ethereum-cryptography/keccak.js";

// ── arg parsing ───────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const NODE_URL = arg("node", "https://emberchain.org").replace(/\/$/, "");
const MINER_ADDRESS = arg("address", "");
const INTENSITY = Math.max(1, Math.min(5, parseInt(arg("intensity", "3"), 10)));
const SUBMIT_SHARES = arg("shares", "true") !== "false";

const BATCH_SIZES: Record<number, number> = { 1: 500, 2: 2000, 3: 8000, 4: 25000, 5: 80000 };
const BATCH_SIZE = BATCH_SIZES[INTENSITY] ?? 8000;
const MAX_HASHES_PER_TEMPLATE = 2_000_000;

if (!MINER_ADDRESS.match(/^0x[0-9a-fA-F]{40}$/)) {
  console.error("❌  --address must be a valid 0x… Ethereum address");
  process.exit(1);
}

// ── PoW helpers ───────────────────────────────────────────────────────────────

interface Header {
  number: number;
  parentHash: string;
  timestamp: number;
  miner: string;
  difficulty: string;
  transactionsRoot: string;
}

const enc = new TextEncoder();

function encodeHeader(h: Header, nonce: bigint): Uint8Array {
  return enc.encode(
    JSON.stringify({
      number: h.number,
      parentHash: h.parentHash,
      timestamp: h.timestamp,
      miner: h.miner,
      difficulty: h.difficulty,
      transactionsRoot: h.transactionsRoot,
      nonce: nonce.toString(),
    }),
  );
}

function hashHeader(h: Header, nonce: bigint): { hex: string; value: bigint } {
  const bytes = keccak256(encodeHeader(h, nonce));
  const hex = "0x" + Buffer.from(bytes).toString("hex");
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return { hex, value };
}

function randomNonce(): bigint {
  const hi = Math.floor(Math.random() * 0x1_000_000);
  const lo = Math.floor(Math.random() * 0x1_000_000);
  return (BigInt(hi) << 24n) | BigInt(lo);
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function fetchTemplate() {
  const res = await fetch(`${NODE_URL}/api/mining/template?minerAddress=${MINER_ADDRESS}`);
  if (!res.ok) throw new Error(`Template fetch failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    header: Header;
    target: string;
    shareTarget: string;
  }>;
}

async function submitShare(header: Header, nonce: string) {
  const res = await fetch(`${NODE_URL}/api/mining/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minerAddress: MINER_ADDRESS, header, nonce }),
  });
  const data = (await res.json()) as { accepted?: boolean; blockFound?: boolean; error?: string };
  return data;
}

async function submitBlock(header: Header, nonce: string, blockHash: string) {
  const res = await fetch(`${NODE_URL}/api/mining/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ header, nonce, blockHash }),
  });
  if (res.status === 409) return { stale: true };
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? `Submit failed: ${res.status}`);
  }
  return res.json() as Promise<{ number?: number }>;
}

// ── mining loop ───────────────────────────────────────────────────────────────

let totalBlocks = 0;
let totalShares = 0;
let sessionStart = Date.now();

async function mineLoop() {
  console.log(`\n⛏️   Emberchain Miner`);
  console.log(`    Node      : ${NODE_URL}`);
  console.log(`    Address   : ${MINER_ADDRESS}`);
  console.log(`    Intensity : ${INTENSITY} (${BATCH_SIZE.toLocaleString()} hashes/batch)`);
  console.log(`    Shares    : ${SUBMIT_SHARES ? "on" : "off"}\n`);

  for (;;) {
    let template: { header: Header; target: string; shareTarget: string };
    try {
      template = await fetchTemplate();
    } catch (err) {
      console.warn(`⚠️  Failed to fetch template: ${(err as Error).message} — retrying in 5s`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const { header, target, shareTarget } = template;
    const blockTarget = BigInt(target);
    const shareTargetBig = BigInt(shareTarget);

    let nonce = randomNonce();
    let hashCount = 0;
    let batchStart = Date.now();
    let batchHashes = 0;
    let templateDone = false;

    while (!templateDone) {
      for (let i = 0; i < BATCH_SIZE; i++) {
        const { hex, value } = hashHeader(header, nonce);
        hashCount++;
        batchHashes++;

        if (value <= blockTarget) {
          // Full block found!
          const result = await submitBlock(header, nonce.toString(), hex);
          if ("stale" in result) {
            console.log(`  ↩️  Stale block (chain advanced) — fetching new template`);
          } else {
            totalBlocks++;
            const elapsed = ((Date.now() - sessionStart) / 1000 / 60).toFixed(1);
            console.log(
              `  🟧 BLOCK FOUND  #${result.number ?? "?"}  nonce=${nonce}  ` +
              `[${totalBlocks} blocks, ${totalShares} shares, ${elapsed}min]`,
            );
          }
          templateDone = true;
          break;
        }

        if (SUBMIT_SHARES && value <= shareTargetBig) {
          submitShare(header, nonce.toString()).then((r) => {
            if (r.accepted) {
              totalShares++;
              process.stdout.write(`  ✅ share #${totalShares}\r`);
            }
            if (r.blockFound) {
              totalBlocks++;
              console.log(`\n  🟧 BLOCK via share  [total: ${totalBlocks}]`);
            }
          }).catch(() => {/* ignore stale share errors */});
        }

        nonce++;
      }

      if (!templateDone) {
        // Print hash rate
        const elapsedMs = Date.now() - batchStart;
        if (elapsedMs > 0) {
          const hr = Math.round((batchHashes / elapsedMs) * 1000);
          const hrStr = hr >= 1000 ? `${(hr / 1000).toFixed(1)}kH/s` : `${hr}H/s`;
          process.stdout.write(
            `  ⛏️  block #${header.number}  diff=${BigInt(header.difficulty).toLocaleString()}  ${hrStr}  nonce=${nonce}\r`,
          );
          batchStart = Date.now();
          batchHashes = 0;
        }

        if (hashCount >= MAX_HASHES_PER_TEMPLATE) {
          console.log(`\n  ↻  Template exhausted — fetching fresh template`);
          templateDone = true;
        }

        // Yield
        await new Promise((r) => setImmediate(r));
      }
    }
  }
}

mineLoop().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
