/**
 * GET /api/mining/stats
 *
 * Public pool-stats endpoint compatible with WhatToMine's pool API listing
 * requirements. Aggregates data from chain-node and exposes it in the format
 * WhatToMine uses when evaluating a coin for listing.
 *
 * WhatToMine pool listing requires:
 *   - Algorithm, network hashrate, difficulty, block height, block reward, miner count
 *   - A stable public URL that returns this JSON
 *
 * No auth required — intentionally public.
 */

import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const CHAIN_NODE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");

// 5-second cache — prevents thundering herd on the chain-node while keeping
// data fresh enough that WhatToMine crawlers see accurate values.
let cache: { data: object; ts: number } | null = null;
const CACHE_TTL_MS = 5_000;

/** Fetch a JSON endpoint from the chain-node with a timeout. */
async function nodeGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const r = await fetch(`${CHAIN_NODE_URL}${path}`, { signal: controller.signal });
    if (!r.ok) throw new Error(`chain-node ${path} → HTTP ${r.status}`);
    return await r.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

router.get("/mining/stats", async (_req, res) => {
  // Serve from cache when fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(cache.data);
    return;
  }

  try {
    // Fetch chain status and mining status from chain-node in parallel
    const [chainStatus, miningStatus] = await Promise.all([
      nodeGet<{
        height: number;
        difficulty: string;
        targetBlockTimeSeconds: number;
        totalSupply: string;
        avgBlockTime: number | null;
        latestBlockHash: string;
      }>("/api/chain/status"),
      nodeGet<{
        difficulty: string;
        blockReward: string;
        activeMiners: number;
        sharesInRound: Record<string, number>;
        hashRate: number; // server-side miner hashrate (H/s), not pool total
      }>("/api/mining/status"),
    ]);

    // Network hashrate = difficulty / avg_block_time_seconds
    // difficulty ≈ expected hashes per block (standard PoW relationship)
    const difficulty = BigInt(chainStatus.difficulty);
    const blockTimeSec = chainStatus.avgBlockTime ?? chainStatus.targetBlockTimeSeconds;
    // Use Number() safely — difficulty can be large but fits in float for display
    const networkHashrate = blockTimeSec > 0
      ? Math.round(Number(difficulty) / blockTimeSec)
      : 0;

    // Total shares submitted in the current round
    const totalSharesInRound = Object.values(miningStatus.sharesInRound)
      .reduce((s, n) => s + n, 0);

    // Round luck: shares submitted vs expected shares per block.
    // shareDifficultyDivisor = 256, so expected shares per block ≈ 256.
    const EXPECTED_SHARES_PER_BLOCK = 256;
    const luck = totalSharesInRound > 0
      ? Math.round((EXPECTED_SHARES_PER_BLOCK / totalSharesInRound) * 100)
      : 100;

    // blockReward from chain config is in wei (18 decimals) — convert to EMBR
    const blockRewardEmbr = Number(BigInt(miningStatus.blockReward)) / 1e18;

    const stats = {
      // ── Core identity ─────────────────────────────────────────────────────
      coin:           "EMBR",
      coinName:       "Emberchain",
      algorithm:      "Keccak256 Custom Header PoW",
      chainId:        7773,

      // ── Network metrics ───────────────────────────────────────────────────
      networkHashrate,                   // H/s
      networkHashrateReadable: formatHashrate(networkHashrate),
      difficulty:     chainStatus.difficulty,
      blockHeight:    chainStatus.height,
      blockReward:    blockRewardEmbr,   // EMBR per block (not wei)
      targetBlockTime: chainStatus.targetBlockTimeSeconds,  // seconds
      avgBlockTime:   blockTimeSec,      // seconds (recent 20-block average)

      // ── Pool / miner metrics ──────────────────────────────────────────────
      miners:         miningStatus.activeMiners,    // unique miners last 5 min
      sharesThisRound: totalSharesInRound,
      luck,                                          // % (100 = average)
      poolFee:        0,                             // % — no pool fee

      // ── Supply / economics ────────────────────────────────────────────────
      totalSupply:    chainStatus.totalSupply,       // wei string
      halvingSchedule: "None — fixed 5 EMBR block reward (no halving planned)",

      // ── Links ─────────────────────────────────────────────────────────────
      explorer:      "https://emberchain.org",
      miningEndpoint: "https://emberchain.org/api/mining",
      rpcEndpoint:    "https://emberchain.org/api/rpc",
      sourceCode:     "https://github.com/RedPillPhil/Emberchain",

      // ── Timestamp ─────────────────────────────────────────────────────────
      timestamp:     new Date().toISOString(),
    };

    cache = { data: stats, ts: Date.now() };
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(stats);
  } catch (err) {
    logger.warn({ err }, "[mining-stats] failed to fetch from chain-node");

    // Serve stale cache rather than a 503 if we have anything at all
    if (cache) {
      res.setHeader("Cache-Control", "public, max-age=5");
      res.json({ ...cache.data, stale: true });
      return;
    }

    res.status(503).json({ error: "Chain node unavailable — please retry" });
  }
});

/** Human-readable hashrate string (H/s → KH/s → MH/s → GH/s → TH/s). */
function formatHashrate(hps: number): string {
  if (hps >= 1e12) return `${(hps / 1e12).toFixed(2)} TH/s`;
  if (hps >= 1e9)  return `${(hps / 1e9).toFixed(2)} GH/s`;
  if (hps >= 1e6)  return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3)  return `${(hps / 1e3).toFixed(2)} KH/s`;
  return `${hps} H/s`;
}

export default router;
