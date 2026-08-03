/**
 * Chain Invaders leaderboard persistence (tournament scores only).
 * Self-bootstraps a Postgres table; falls back to in-memory if DB is down.
 */

import pg from "pg";
import { logger } from "./logger";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[invaders-lb] Pool error:", err.message);
});

export type LeaderRow = {
  player: string;
  cumulative: number;
  bestSingle: number;
  dayId: number;
};

export type AllTimeRow = {
  player: string;
  score: number;
  dayId: number;
};

type MemRow = {
  dayId: number;
  player: string;
  cumulative: number;
  bestSingle: number;
};

const mem = new Map<string, MemRow>(); // `${dayId}:${player}`
let tablesReady = false;

function memKey(dayId: number, player: string) {
  return `${dayId}:${player.toLowerCase()}`;
}

export async function ensureLeaderboardTables(): Promise<void> {
  if (tablesReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chain_invaders_scores (
        day_id       BIGINT       NOT NULL,
        player       TEXT         NOT NULL,
        cumulative   BIGINT       NOT NULL DEFAULT 0,
        best_single  BIGINT       NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        PRIMARY KEY (day_id, player)
      );
      CREATE INDEX IF NOT EXISTS chain_invaders_scores_day_cum_idx
        ON chain_invaders_scores (day_id, cumulative DESC);
      CREATE INDEX IF NOT EXISTS chain_invaders_scores_best_idx
        ON chain_invaders_scores (best_single DESC);
    `);
    tablesReady = true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "chain invaders leaderboard table ensure failed — using memory",
    );
  }
}

/** Upsert after a verified tournament attest/reveal (scores only count in-window + entered). */
export async function upsertTournamentScore(input: {
  dayId: number;
  player: string;
  runScore: number;
}): Promise<void> {
  const dayId = Math.floor(input.dayId);
  const player = input.player.toLowerCase();
  const run = Math.max(0, Math.floor(input.runScore));
  if (!player.startsWith("0x") || player.length !== 42 || run <= 0) return;

  await ensureLeaderboardTables();

  const key = memKey(dayId, player);
  const prev = mem.get(key);
  const nextCum = (prev?.cumulative ?? 0) + run;
  const nextBest = Math.max(prev?.bestSingle ?? 0, run);
  mem.set(key, { dayId, player, cumulative: nextCum, bestSingle: nextBest });

  try {
    await pool.query(
      `INSERT INTO chain_invaders_scores (day_id, player, cumulative, best_single, updated_at)
       VALUES ($1, $2, $3, $3, NOW())
       ON CONFLICT (day_id, player) DO UPDATE SET
         cumulative = chain_invaders_scores.cumulative + $3,
         best_single = GREATEST(chain_invaders_scores.best_single, $3),
         updated_at = NOW()`,
      [dayId, player, run],
    );
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "leaderboard upsert fell back to memory only",
    );
  }
}

/** Replace absolute totals from chain (preferred after reveal). */
export async function setTournamentTotals(input: {
  dayId: number;
  player: string;
  cumulative: number;
  bestSingle: number;
}): Promise<void> {
  const dayId = Math.floor(input.dayId);
  const player = input.player.toLowerCase();
  const cumulative = Math.max(0, Math.floor(input.cumulative));
  const bestSingle = Math.max(0, Math.floor(input.bestSingle));
  if (!player.startsWith("0x") || player.length !== 42) return;

  await ensureLeaderboardTables();
  mem.set(memKey(dayId, player), { dayId, player, cumulative, bestSingle });

  try {
    await pool.query(
      `INSERT INTO chain_invaders_scores (day_id, player, cumulative, best_single, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (day_id, player) DO UPDATE SET
         cumulative = GREATEST(chain_invaders_scores.cumulative, EXCLUDED.cumulative),
         best_single = GREATEST(chain_invaders_scores.best_single, EXCLUDED.best_single),
         updated_at = NOW()`,
      [dayId, player, cumulative, bestSingle],
    );
  } catch {
    /* memory already updated */
  }
}

export async function getCumulativeLeaders(
  dayId: number,
  offset = 0,
  limit = 10,
): Promise<{ rows: LeaderRow[]; total: number }> {
  await ensureLeaderboardTables();
  const day = Math.floor(dayId);
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.min(100, Math.max(1, Math.floor(limit)));

  try {
    const countR = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM chain_invaders_scores WHERE day_id = $1 AND cumulative > 0`,
      [day],
    );
    const { rows } = await pool.query<{
      player: string;
      cumulative: string;
      best_single: string;
      day_id: string;
    }>(
      `SELECT player, cumulative, best_single, day_id
       FROM chain_invaders_scores
       WHERE day_id = $1 AND cumulative > 0
       ORDER BY cumulative DESC, best_single DESC, player ASC
       LIMIT $2 OFFSET $3`,
      [day, lim, off],
    );
    return {
      total: Math.min(100, Number(countR.rows[0]?.c ?? 0)),
      rows: rows.map((r) => ({
        player: r.player,
        cumulative: Number(r.cumulative),
        bestSingle: Number(r.best_single),
        dayId: Number(r.day_id),
      })),
    };
  } catch {
    const all = [...mem.values()]
      .filter((r) => r.dayId === day && r.cumulative > 0)
      .sort((a, b) => b.cumulative - a.cumulative || b.bestSingle - a.bestSingle);
    const sliced = all.slice(off, off + lim);
    return {
      total: Math.min(100, all.length),
      rows: sliced.map((r) => ({
        player: r.player,
        cumulative: r.cumulative,
        bestSingle: r.bestSingle,
        dayId: r.dayId,
      })),
    };
  }
}

export async function getDailyBestSingle(dayId: number): Promise<LeaderRow | null> {
  await ensureLeaderboardTables();
  const day = Math.floor(dayId);
  try {
    const { rows } = await pool.query<{
      player: string;
      cumulative: string;
      best_single: string;
      day_id: string;
    }>(
      `SELECT player, cumulative, best_single, day_id
       FROM chain_invaders_scores
       WHERE day_id = $1 AND best_single > 0
       ORDER BY best_single DESC, cumulative DESC
       LIMIT 1`,
      [day],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      player: r.player,
      cumulative: Number(r.cumulative),
      bestSingle: Number(r.best_single),
      dayId: Number(r.day_id),
    };
  } catch {
    const best = [...mem.values()]
      .filter((r) => r.dayId === day && r.bestSingle > 0)
      .sort((a, b) => b.bestSingle - a.bestSingle)[0];
    return best
      ? {
          player: best.player,
          cumulative: best.cumulative,
          bestSingle: best.bestSingle,
          dayId: best.dayId,
        }
      : null;
  }
}

export async function getAllTimeBestSingle(): Promise<AllTimeRow | null> {
  await ensureLeaderboardTables();
  try {
    const { rows } = await pool.query<{
      player: string;
      best_single: string;
      day_id: string;
    }>(
      `SELECT player, best_single, day_id
       FROM chain_invaders_scores
       WHERE best_single > 0
       ORDER BY best_single DESC, updated_at ASC
       LIMIT 1`,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      player: r.player,
      score: Number(r.best_single),
      dayId: Number(r.day_id),
    };
  } catch {
    const best = [...mem.values()]
      .filter((r) => r.bestSingle > 0)
      .sort((a, b) => b.bestSingle - a.bestSingle)[0];
    return best
      ? { player: best.player, score: best.bestSingle, dayId: best.dayId }
      : null;
  }
}
