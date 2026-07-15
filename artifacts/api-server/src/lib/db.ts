/**
 * PostgreSQL persistence hooks for the Emberchain ledger.
 *
 * The chain state is stored as a single JSONB row in `chain_state`.
 * On startup the blockchain loads from DB first (always up-to-date across
 * deploys), falling back to the local file only when the row is absent.
 * Every persist() call saves to the local file synchronously AND fires a
 * background upsert to PG — if PG is briefly unavailable the file keeps
 * things running and the next successful persist catches PG back up.
 */

import pg from "pg";
import type { PersistedChain } from "@workspace/chain-core";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

const STATE_ID = "main";

export async function loadChainFromDB(): Promise<PersistedChain | null> {
  try {
    const { rows } = await pool.query<{ data: PersistedChain }>(
      "SELECT data FROM chain_state WHERE id = $1",
      [STATE_ID],
    );
    return rows[0]?.data ?? null;
  } catch (err) {
    console.error("[db] Could not load chain state from database:", (err as Error).message);
    return null;
  }
}

export async function saveChainToDB(data: PersistedChain): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chain_state (id, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data,
             updated_at = NOW()`,
      [STATE_ID, JSON.stringify(data)],
    );
  } catch (err) {
    console.error("[db] Could not save chain state to database:", (err as Error).message);
  }
}

/** Pass these to the Blockchain constructor so it uses PG for persistence. */
export function createChainPersistenceHooks() {
  return {
    asyncLoadHook: loadChainFromDB,
    asyncPersistHook: saveChainToDB,
  };
}
