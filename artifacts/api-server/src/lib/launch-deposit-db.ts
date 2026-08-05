/**
 * Launch bridge deposits — tracks native-chain sends to escrow addresses
 * and Base-side minting via UniversalBridge.bridgeIn.
 */

import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export async function ensureLaunchDepositTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS launch_deposits (
      id                  TEXT PRIMARY KEY,
      launch_id           TEXT NOT NULL,
      native_tx_hash      TEXT NOT NULL UNIQUE,
      native_from         TEXT,
      gross_amount        TEXT NOT NULL,
      base_recipient      TEXT NOT NULL,
      bridge_in_tx_hash   TEXT,
      bridge_in_nonce     TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      error_msg           TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_launch_deposits_launch ON launch_deposits (launch_id)
  `);
}

export interface LaunchDeposit {
  id: string;
  launch_id: string;
  native_tx_hash: string;
  native_from?: string;
  gross_amount: string;
  base_recipient: string;
  bridge_in_tx_hash?: string;
  bridge_in_nonce?: string;
  status: "pending" | "minted" | "failed";
  error_msg?: string;
  created_at: Date;
  updated_at: Date;
}

export async function getDepositByNativeTx(nativeTxHash: string): Promise<LaunchDeposit | null> {
  const res = await pool.query<LaunchDeposit>(
    "SELECT * FROM launch_deposits WHERE native_tx_hash = $1",
    [nativeTxHash.toLowerCase()],
  );
  return res.rows[0] ?? null;
}

export async function createLaunchDeposit(data: {
  id: string;
  launch_id: string;
  native_tx_hash: string;
  native_from?: string;
  gross_amount: string;
  base_recipient: string;
}): Promise<LaunchDeposit> {
  const res = await pool.query<LaunchDeposit>(
    `INSERT INTO launch_deposits (id, launch_id, native_tx_hash, native_from, gross_amount, base_recipient)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      data.id,
      data.launch_id,
      data.native_tx_hash.toLowerCase(),
      data.native_from?.toLowerCase() ?? null,
      data.gross_amount,
      data.base_recipient.toLowerCase(),
    ],
  );
  return res.rows[0];
}

export async function updateLaunchDeposit(
  id: string,
  patch: Partial<Pick<LaunchDeposit, "status" | "bridge_in_tx_hash" | "bridge_in_nonce">> & {
    error_msg?: string | null;
    base_recipient?: string;
  },
): Promise<void> {
  const sets = ["updated_at = NOW()"];
  const vals: unknown[] = [id];
  let idx = 2;
  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      sets.push(`${key} = $${idx++}`);
      vals.push(val);
    }
  }
  await pool.query(`UPDATE launch_deposits SET ${sets.join(", ")} WHERE id = $1`, vals);
}

export async function getDepositsForLaunch(launchId: string): Promise<LaunchDeposit[]> {
  const res = await pool.query<LaunchDeposit>(
    "SELECT * FROM launch_deposits WHERE launch_id = $1 ORDER BY created_at DESC",
    [launchId],
  );
  return res.rows;
}
