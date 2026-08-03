/**
 * Chain Invaders score signing (ECDSA game-server signatures) + leaderboard.
 *
 * The api-server holds GAME_SIGNER_PRIVATE_KEY and signs:
 *   keccak256(abi.encodePacked(player, dayId, score, playHash))
 *
 * POST /api/chain-invaders/attest
 * POST /api/chain-invaders/round-seed   — unpredictable run seed (anti offline grind)
 * GET  /api/chain-invaders/leaderboard
 * GET  /api/chain-invaders/signer
 */

import { Router, type Request, type Response } from "express";
import { Wallet, keccak256, solidityPacked, getBytes, randomBytes, hexlify } from "ethers";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { settleEligibleDays } from "../lib/chain-invaders-settler";
import {
  ensureLeaderboardTables,
  getAllTimeBestSingle,
  getCumulativeLeaders,
  getDailyBestSingle,
  setTournamentTotals,
  upsertTournamentScore,
} from "../lib/chain-invaders-leaderboard";

const router = Router();

const MAX_SCORE_PER_SEC = 80;
const MIN_DURATION_MS = 8_000;
const MAX_SCORE = 500_000;
const ROUND_SEED_TTL_MS = 45 * 60 * 1000;

type IssuedRound = { seed: string; issuedAt: number; player?: string };
const issuedRounds = new Map<string, IssuedRound>(); // token -> round

function getGameSigner(): Wallet | null {
  const key = (
    process.env.CHAIN_INVADERS_SIGNER_KEY ||
    process.env.GAME_SIGNER_PRIVATE_KEY ||
    process.env.CHAIN_INVADERS_ORACLE_KEY ||
    ""
  ).trim();
  if (!key) return null;
  try {
    return new Wallet(key.startsWith("0x") ? key : `0x${key}`);
  } catch {
    return null;
  }
}

function roundHmacSecret(): string {
  return (
    process.env.CHAIN_INVADERS_ROUND_SECRET ||
    process.env.CHAIN_INVADERS_SIGNER_KEY ||
    process.env.GAME_SIGNER_PRIVATE_KEY ||
    "ember-invaders-dev-secret"
  );
}

function pruneRounds() {
  const now = Date.now();
  for (const [token, row] of issuedRounds) {
    if (now - row.issuedAt > ROUND_SEED_TTL_MS) issuedRounds.delete(token);
  }
}

function tokenMatchesSeed(token: string, seed: string): boolean {
  const row = issuedRounds.get(token);
  if (!row) return false;
  if (Date.now() - row.issuedAt > ROUND_SEED_TTL_MS) {
    issuedRounds.delete(token);
    return false;
  }
  try {
    const a = Buffer.from(row.seed);
    const b = Buffer.from(seed);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

void ensureLeaderboardTables();

router.get("/chain-invaders/signer", (_req: Request, res: Response) => {
  const signer = getGameSigner();
  res.json({
    configured: Boolean(signer),
    address: signer?.address ?? null,
  });
});

/** @deprecated Prefer /signer — kept so older clients still resolve. */
router.get("/chain-invaders/oracle", (_req: Request, res: Response) => {
  const signer = getGameSigner();
  res.json({
    configured: Boolean(signer),
    address: signer?.address ?? null,
  });
});

/**
 * Issue a cryptographically strong run seed. Client cannot offline-grind
 * perfect playthroughs without requesting a seed first. Mid-run reactive
 * bots can still exist; full prevention needs server-side simulation.
 */
router.post("/chain-invaders/round-seed", (req: Request, res: Response) => {
  pruneRounds();
  const player =
    typeof req.body?.player === "string" && /^0x[0-9a-fA-F]{40}$/.test(req.body.player)
      ? req.body.player.toLowerCase()
      : undefined;

  const seedBytes = randomBytes(32);
  const seed = hexlify(seedBytes);
  const token = createHmac("sha256", roundHmacSecret())
    .update(seedBytes)
    .update(String(Date.now()))
    .digest("hex");

  issuedRounds.set(token, { seed, issuedAt: Date.now(), player });

  // Commitment clients can show / log without revealing future HMAC stream early
  const commitment = createHash("sha256").update(seedBytes).digest("hex");

  res.json({
    seed,
    token,
    commitment: `0x${commitment}`,
    expiresInMs: ROUND_SEED_TTL_MS,
  });
});

router.get("/chain-invaders/leaderboard", async (req: Request, res: Response) => {
  try {
    const dayId = Number(req.query.dayId);
    const offset = Number(req.query.offset ?? 0);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isFinite(dayId) || dayId < 0) {
      res.status(400).json({ error: "dayId required" });
      return;
    }
    const [cumulative, dailyBest, allTime] = await Promise.all([
      getCumulativeLeaders(dayId, offset, limit),
      getDailyBestSingle(dayId),
      getAllTimeBestSingle(),
    ]);
    res.json({
      dayId: Math.floor(dayId),
      offset: Math.max(0, Math.floor(offset)),
      limit: Math.min(100, Math.max(1, Math.floor(limit))),
      cumulative,
      dailyBest,
      allTime,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Leaderboard failed",
    });
  }
});

/** After on-chain reveal — sync absolute totals (preferred). */
router.post("/chain-invaders/leaderboard/sync", async (req: Request, res: Response) => {
  try {
    const { player, dayId, cumulative, bestSingle } = req.body ?? {};
    if (
      typeof player !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(player) ||
      !Number.isFinite(Number(dayId)) ||
      !Number.isFinite(Number(cumulative)) ||
      !Number.isFinite(Number(bestSingle))
    ) {
      res.status(400).json({ error: "Invalid sync payload" });
      return;
    }
    await setTournamentTotals({
      dayId: Number(dayId),
      player,
      cumulative: Number(cumulative),
      bestSingle: Number(bestSingle),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Sync failed",
    });
  }
});

router.post("/chain-invaders/attest", async (req: Request, res: Response) => {
  try {
    const signer = getGameSigner();
    if (!signer) {
      res.status(503).json({
        error:
          "Game signer not configured — set CHAIN_INVADERS_SIGNER_KEY (ECDSA private key) on api-server",
      });
      return;
    }

    const { player, dayId, score, playHash, seed, durationMs, kills, roundToken } =
      req.body ?? {};

    if (
      typeof player !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(player) ||
      typeof playHash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(playHash) ||
      typeof seed !== "string" ||
      seed.length < 4
    ) {
      res.status(400).json({ error: "Invalid player / playHash / seed" });
      return;
    }

    // Prefer server-issued seeds when present (older clients may omit token).
    if (typeof roundToken === "string" && roundToken.length >= 16) {
      if (!tokenMatchesSeed(roundToken, seed)) {
        res.status(400).json({ error: "Invalid or expired round seed token" });
        return;
      }
    }

    const scoreN = Number(score);
    const dayN = Number(dayId);
    const dur = Number(durationMs);
    const killN = Number(kills ?? 0);

    if (!Number.isFinite(scoreN) || scoreN <= 0 || scoreN > MAX_SCORE) {
      res.status(400).json({ error: "Score out of range" });
      return;
    }
    if (!Number.isFinite(dayN) || dayN < 0) {
      res.status(400).json({ error: "Invalid dayId" });
      return;
    }
    if (!Number.isFinite(dur) || dur < MIN_DURATION_MS) {
      res.status(400).json({
        error: `Play too short — minimum ${MIN_DURATION_MS / 1000}s`,
      });
      return;
    }

    const maxByTime = Math.ceil((dur / 1000) * MAX_SCORE_PER_SEC) + 200;
    if (scoreN > maxByTime) {
      res.status(400).json({ error: "Score exceeds honest play ceiling for duration" });
      return;
    }
    if (killN > 0 && scoreN > killN * 80 + 500) {
      res.status(400).json({ error: "Score inconsistent with kill count" });
      return;
    }

    const digest = keccak256(
      solidityPacked(
        ["address", "uint256", "uint256", "bytes32"],
        [player, BigInt(Math.floor(dayN)), BigInt(Math.floor(scoreN)), playHash],
      ),
    );

    const signature = await signer.signMessage(getBytes(digest));

    // Leaderboard: tournament attestations only (client only attests when entered + in window)
    void upsertTournamentScore({
      dayId: Math.floor(dayN),
      player,
      runScore: Math.floor(scoreN),
    });

    if (typeof roundToken === "string") {
      issuedRounds.delete(roundToken);
    }

    res.json({
      signature,
      attestation: signature,
      signer: signer.address,
      digest,
      player,
      dayId: Math.floor(dayN),
      score: Math.floor(scoreN),
      playHash,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Signing failed",
    });
  }
});

router.post("/chain-invaders/settle", async (_req: Request, res: Response) => {
  try {
    const result = await settleEligibleDays();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Settle failed",
    });
  }
});

export default router;
