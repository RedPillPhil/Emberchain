/**
 * PostgreSQL persistence for the Ember airdrop campaign.
 */

import pg from "pg";
import { logger } from "./logger";
import {
  AIRDROP_POOL_TOTAL,
  type TaskId,
  utcDayKey,
} from "./airdrop-config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[airdrop-db] Pool error:", err.message);
});

let tablesReady = false;

export type AirdropUser = {
  wallet: string;
  referrer: string | null;
  createdAt: Date;
  lastCheckinAt: Date | null;
};

export type TaskCompletion = {
  wallet: string;
  taskId: TaskId;
  rewardEmbr: number;
  txHash: string | null;
  lockedUntil: Date | null;
  completedAt: Date;
  meta: Record<string, unknown>;
};

export async function ensureAirdropTables(): Promise<void> {
  if (tablesReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS airdrop_users (
        wallet           TEXT PRIMARY KEY,
        referrer         TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_checkin_at  TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS airdrop_users_referrer_idx ON airdrop_users (referrer);

      CREATE TABLE IF NOT EXISTS airdrop_completions (
        id             BIGSERIAL PRIMARY KEY,
        wallet         TEXT NOT NULL,
        task_id        TEXT NOT NULL,
        reward_embr    NUMERIC(24, 8) NOT NULL DEFAULT 0,
        tx_hash        TEXT,
        locked_until   TIMESTAMPTZ,
        completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (wallet, task_id)
      );
      CREATE INDEX IF NOT EXISTS airdrop_completions_wallet_idx ON airdrop_completions (wallet);
      CREATE INDEX IF NOT EXISTS airdrop_completions_task_idx ON airdrop_completions (task_id);

      CREATE TABLE IF NOT EXISTS airdrop_daily_caps (
        day_key        TEXT PRIMARY KEY,
        distributed    NUMERIC(24, 8) NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS airdrop_pool (
        id             TEXT PRIMARY KEY DEFAULT 'main',
        remaining      NUMERIC(24, 8) NOT NULL,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS airdrop_visit_tokens (
        token          TEXT PRIMARY KEY,
        wallet         TEXT NOT NULL,
        task_id        TEXT NOT NULL,
        expires_at     TIMESTAMPTZ NOT NULL,
        used_at        TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS airdrop_liquidity_donations (
        id             BIGSERIAL PRIMARY KEY,
        wallet         TEXT NOT NULL,
        tx_hash        TEXT NOT NULL UNIQUE,
        chain          TEXT NOT NULL,
        amount_wei     NUMERIC(78, 0) NOT NULL,
        reward_embr    NUMERIC(24, 8) NOT NULL,
        locked_until   TIMESTAMPTZ NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS airdrop_checkins (
        wallet         TEXT NOT NULL,
        day_key        TEXT NOT NULL,
        reward_embr    NUMERIC(24, 8) NOT NULL,
        tx_hash        TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (wallet, day_key)
      );
    `);

    await pool.query(
      `INSERT INTO airdrop_pool (id, remaining) VALUES ('main', $1)
       ON CONFLICT (id) DO NOTHING`,
      [AIRDROP_POOL_TOTAL],
    );

    tablesReady = true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "airdrop tables ensure failed",
    );
    throw err;
  }
}

function normWallet(w: string): string {
  return w.toLowerCase();
}

export async function countParticipants(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM airdrop_users",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getPoolRemaining(): Promise<number> {
  const { rows } = await pool.query<{ remaining: string }>(
    "SELECT remaining::text FROM airdrop_pool WHERE id = 'main'",
  );
  return Number(rows[0]?.remaining ?? AIRDROP_POOL_TOTAL);
}

export async function getDailyDistributed(dayKey = utcDayKey()): Promise<number> {
  const { rows } = await pool.query<{ distributed: string }>(
    "SELECT distributed::text FROM airdrop_daily_caps WHERE day_key = $1",
    [dayKey],
  );
  return Number(rows[0]?.distributed ?? 0);
}

export async function getUser(wallet: string): Promise<AirdropUser | null> {
  const w = normWallet(wallet);
  const { rows } = await pool.query<{
    wallet: string;
    referrer: string | null;
    created_at: Date;
    last_checkin_at: Date | null;
  }>(
    "SELECT wallet, referrer, created_at, last_checkin_at FROM airdrop_users WHERE wallet = $1",
    [w],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    wallet: r.wallet,
    referrer: r.referrer,
    createdAt: r.created_at,
    lastCheckinAt: r.last_checkin_at,
  };
}

export async function registerUser(wallet: string, referrer: string | null): Promise<AirdropUser> {
  const w = normWallet(wallet);
  const ref = referrer ? normWallet(referrer) : null;
  const safeRef = ref && ref !== w ? ref : null;

  await pool.query(
    `INSERT INTO airdrop_users (wallet, referrer)
     VALUES ($1, $2)
     ON CONFLICT (wallet) DO UPDATE SET referrer = COALESCE(airdrop_users.referrer, EXCLUDED.referrer)`,
    [w, safeRef],
  );

  const user = await getUser(w);
  if (!user) throw new Error("registerUser failed");
  return user;
}

export async function setLastCheckin(wallet: string, at: Date): Promise<void> {
  await pool.query(
    "UPDATE airdrop_users SET last_checkin_at = $2 WHERE wallet = $1",
    [normWallet(wallet), at],
  );
}

export async function listCompletions(wallet: string): Promise<TaskCompletion[]> {
  const { rows } = await pool.query<{
    wallet: string;
    task_id: string;
    reward_embr: string;
    tx_hash: string | null;
    locked_until: Date | null;
    completed_at: Date;
    meta: Record<string, unknown>;
  }>(
    `SELECT wallet, task_id, reward_embr::text, tx_hash, locked_until, completed_at, meta
     FROM airdrop_completions WHERE wallet = $1 ORDER BY completed_at`,
    [normWallet(wallet)],
  );
  return rows.map((r) => ({
    wallet: r.wallet,
    taskId: r.task_id as TaskId,
    rewardEmbr: Number(r.reward_embr),
    txHash: r.tx_hash,
    lockedUntil: r.locked_until,
    completedAt: r.completed_at,
    meta: r.meta ?? {},
  }));
}

export async function isTaskComplete(wallet: string, taskId: TaskId): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM airdrop_completions WHERE wallet = $1 AND task_id = $2) AS ok",
    [normWallet(wallet), taskId],
  );
  return Boolean(rows[0]?.ok);
}

export async function countLiquidityDonations(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM airdrop_liquidity_donations",
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getReferralTree(wallet: string): Promise<number[]> {
  const w = normWallet(wallet);
  const tiers: number[] = [0, 0, 0, 0, 0];
  let frontier = [w];

  for (let tier = 0; tier < 5; tier++) {
    if (frontier.length === 0) break;
    const { rows } = await pool.query<{ wallet: string }>(
      `SELECT wallet FROM airdrop_users WHERE referrer = ANY($1::text[])`,
      [frontier],
    );
    const next = rows.map((r) => r.wallet);
    tiers[tier] = next.length;
    frontier = next;
  }
  return tiers;
}

export async function getDirectReferrals(wallet: string): Promise<string[]> {
  const { rows } = await pool.query<{ wallet: string }>(
    "SELECT wallet FROM airdrop_users WHERE referrer = $1 ORDER BY created_at",
    [normWallet(wallet)],
  );
  return rows.map((r) => r.wallet);
}

export type PayoutResult = {
  completionId: number;
  rewardEmbr: number;
  txHash: string | null;
  lockedUntil: Date | null;
  referralPayouts: { wallet: string; rewardEmbr: number; txHash: string | null }[];
};

/** Atomically record completion, deduct pool, apply daily cap (unless exempt). */
export async function recordPayout(input: {
  wallet: string;
  taskId: TaskId;
  rewardEmbr: number;
  txHash: string | null;
  lockedUntil: Date | null;
  meta?: Record<string, unknown>;
  exemptDailyCap?: boolean;
  referralPayouts?: { wallet: string; rewardEmbr: number; txHash: string | null }[];
}): Promise<PayoutResult> {
  const client = await pool.connect();
  const dayKey = utcDayKey();
  try {
    await client.query("BEGIN");

    const poolRow = await client.query<{ remaining: string }>(
      "SELECT remaining::text FROM airdrop_pool WHERE id = 'main' FOR UPDATE",
    );
    const remaining = Number(poolRow.rows[0]?.remaining ?? 0);
    const totalOut =
      input.rewardEmbr +
      (input.referralPayouts?.reduce((s, p) => s + p.rewardEmbr, 0) ?? 0);

    if (totalOut > remaining) {
      throw new Error("Airdrop pool exhausted");
    }

    if (!input.exemptDailyCap) {
      const capRow = await client.query<{ distributed: string }>(
        "SELECT distributed::text FROM airdrop_daily_caps WHERE day_key = $1 FOR UPDATE",
        [dayKey],
      );
      const distributed = Number(capRow.rows[0]?.distributed ?? 0);
      const { AIRDROP_DAILY_CAP } = await import("./airdrop-config");
      if (distributed + input.rewardEmbr > AIRDROP_DAILY_CAP) {
        throw new Error("Daily distribution cap reached — try again tomorrow");
      }
      await client.query(
        `INSERT INTO airdrop_daily_caps (day_key, distributed) VALUES ($1, $2)
         ON CONFLICT (day_key) DO UPDATE SET distributed = airdrop_daily_caps.distributed + EXCLUDED.distributed`,
        [dayKey, input.rewardEmbr],
      );
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO airdrop_completions (wallet, task_id, reward_embr, tx_hash, locked_until, meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (wallet, task_id) DO NOTHING
       RETURNING id::text`,
      [
        normWallet(input.wallet),
        input.taskId,
        input.rewardEmbr,
        input.txHash,
        input.lockedUntil,
        JSON.stringify(input.meta ?? {}),
      ],
    );

    if (!ins.rows[0]) {
      throw new Error("Task already completed");
    }

    await client.query(
      "UPDATE airdrop_pool SET remaining = remaining - $1, updated_at = NOW() WHERE id = 'main'",
      [totalOut],
    );

    await client.query("COMMIT");

    return {
      completionId: Number(ins.rows[0].id),
      rewardEmbr: input.rewardEmbr,
      txHash: input.txHash,
      lockedUntil: input.lockedUntil,
      referralPayouts: input.referralPayouts ?? [],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function saveVisitToken(input: {
  token: string;
  wallet: string;
  taskId: TaskId;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO airdrop_visit_tokens (token, wallet, task_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.token, normWallet(input.wallet), input.taskId, input.expiresAt],
  );
}

export async function consumeVisitToken(
  token: string,
): Promise<{ wallet: string; taskId: TaskId } | null> {
  const { rows } = await pool.query<{
    wallet: string;
    task_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    "SELECT wallet, task_id, expires_at, used_at FROM airdrop_visit_tokens WHERE token = $1",
    [token],
  );
  const row = rows[0];
  if (!row || row.used_at || row.expires_at < new Date()) return null;

  await pool.query(
    "UPDATE airdrop_visit_tokens SET used_at = NOW() WHERE token = $1",
    [token],
  );
  return { wallet: row.wallet, taskId: row.task_id as TaskId };
}

export async function recordLiquidityDonation(input: {
  wallet: string;
  txHash: string;
  chain: string;
  amountWei: bigint;
  rewardEmbr: number;
  lockedUntil: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO airdrop_liquidity_donations
       (wallet, tx_hash, chain, amount_wei, reward_embr, locked_until)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      normWallet(input.wallet),
      input.txHash.toLowerCase(),
      input.chain,
      input.amountWei.toString(),
      input.rewardEmbr,
      input.lockedUntil,
    ],
  );
}

export async function hasCheckinToday(wallet: string, dayKey = utcDayKey()): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM airdrop_checkins WHERE wallet = $1 AND day_key = $2) AS ok",
    [normWallet(wallet), dayKey],
  );
  return Boolean(rows[0]?.ok);
}

export async function recordCheckin(input: {
  wallet: string;
  dayKey: string;
  rewardEmbr: number;
  txHash: string | null;
  referralPayouts?: { wallet: string; rewardEmbr: number; txHash: string | null }[];
}): Promise<void> {
  const client = await pool.connect();
  const dayCapKey = utcDayKey();
  try {
    await client.query("BEGIN");

    const totalOut =
      input.rewardEmbr +
      (input.referralPayouts?.reduce((s, p) => s + p.rewardEmbr, 0) ?? 0);

    const poolRow = await client.query<{ remaining: string }>(
      "SELECT remaining::text FROM airdrop_pool WHERE id = 'main' FOR UPDATE",
    );
    if (Number(poolRow.rows[0]?.remaining ?? 0) < totalOut) {
      throw new Error("Airdrop pool exhausted");
    }

    const capRow = await client.query<{ distributed: string }>(
      "SELECT distributed::text FROM airdrop_daily_caps WHERE day_key = $1 FOR UPDATE",
      [dayCapKey],
    );
    const distributed = Number(capRow.rows[0]?.distributed ?? 0);
    const { AIRDROP_DAILY_CAP } = await import("./airdrop-config");
    if (distributed + input.rewardEmbr > AIRDROP_DAILY_CAP) {
      throw new Error("Daily distribution cap reached — try again tomorrow");
    }

    await client.query(
      `INSERT INTO airdrop_checkins (wallet, day_key, reward_embr, tx_hash)
       VALUES ($1, $2, $3, $4)`,
      [normWallet(input.wallet), input.dayKey, input.rewardEmbr, input.txHash],
    );

    await client.query(
      `INSERT INTO airdrop_daily_caps (day_key, distributed) VALUES ($1, $2)
       ON CONFLICT (day_key) DO UPDATE SET distributed = airdrop_daily_caps.distributed + EXCLUDED.distributed`,
      [dayCapKey, input.rewardEmbr],
    );

    await client.query(
      "UPDATE airdrop_pool SET remaining = remaining - $1, updated_at = NOW() WHERE id = 'main'",
      [totalOut],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLockedRewards(wallet: string): Promise<
  { taskId: TaskId; rewardEmbr: number; lockedUntil: Date; claimable: boolean }[]
> {
  const { rows } = await pool.query<{
    task_id: string;
    reward_embr: string;
    locked_until: Date;
  }>(
    `SELECT task_id, reward_embr::text, locked_until FROM airdrop_completions
     WHERE wallet = $1 AND locked_until IS NOT NULL ORDER BY locked_until`,
    [normWallet(wallet)],
  );
  const now = Date.now();
  return rows.map((r) => ({
    taskId: r.task_id as TaskId,
    rewardEmbr: Number(r.reward_embr),
    lockedUntil: r.locked_until,
    claimable: r.locked_until.getTime() <= now,
  }));
}
