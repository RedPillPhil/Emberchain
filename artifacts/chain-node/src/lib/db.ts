/**
 * PostgreSQL persistence hooks for the Emberchain ledger (chain-node service).
 * Identical to the api-server's db.ts — both use the same DATABASE_URL so that
 * chain state persists across service restarts and is shared between deployments.
 */

import pg from "pg";
import type { PersistedChain } from "@workspace/chain-core";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,                        // chain-node only writes; keep footprint small
  idleTimeoutMillis: 10_000,     // release idle connections faster
  connectionTimeoutMillis: 5_000, // give more headroom before timeout error
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

const STATE_ID = "main";

let _pendingSave: PersistedChain | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 4_000;

function scheduleSave(data: PersistedChain): Promise<void> {
  _pendingSave = data;
  if (_saveTimer !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    _saveTimer = setTimeout(async () => {
      _saveTimer = null;
      const payload = _pendingSave!;
      _pendingSave = null;
      try {
        await pool.query(
          `INSERT INTO chain_state (id, data, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE
             SET data = EXCLUDED.data,
                 updated_at = NOW()`,
          [STATE_ID, JSON.stringify(payload)],
        );
      } catch (err) {
        console.error("[db] Could not save chain state:", (err as Error).message);
      }
      resolve();
    }, SAVE_DEBOUNCE_MS);
  });
}

export async function loadChainFromDB(): Promise<PersistedChain | null> {
  try {
    const { rows } = await pool.query<{ data: PersistedChain }>(
      "SELECT data FROM chain_state WHERE id = $1",
      [STATE_ID],
    );
    return rows[0]?.data ?? null;
  } catch (err) {
    console.error("[db] Could not load chain state:", (err as Error).message);
    return null;
  }
}

export async function saveChainToDB(data: PersistedChain): Promise<void> {
  await scheduleSave(data);
}

export async function loadProofsFromDB(): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ proof_key: string }>(
      "SELECT proof_key FROM used_payment_proofs",
    );
    return rows.map((r) => r.proof_key);
  } catch (err) {
    console.error("[db] Could not load proof keys:", (err as Error).message);
    return [];
  }
}

export async function saveProofToDB(
  proofKey: string,
  currency: string,
  txHash: string,
  listingId: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO used_payment_proofs (proof_key, currency, tx_hash, listing_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (proof_key) DO NOTHING`,
      [proofKey, currency, txHash, listingId],
    );
  } catch (err) {
    console.error("[db] Could not save proof key:", (err as Error).message);
  }
}

export async function ensureProofsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS used_payment_proofs (
        proof_key   TEXT        PRIMARY KEY,
        currency    TEXT        NOT NULL,
        tx_hash     TEXT        NOT NULL,
        listing_id  TEXT        NOT NULL,
        fulfilled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error("[db] Could not ensure used_payment_proofs table:", (err as Error).message);
  }
}

export async function clearChainStateFromDB(): Promise<void> {
  await pool.query("DELETE FROM chain_state WHERE id = $1", [STATE_ID]);
}

export function createChainPersistenceHooks() {
  return {
    asyncLoadHook: loadChainFromDB,
    asyncPersistHook: saveChainToDB,
    asyncLoadProofsHook: loadProofsFromDB,
    asyncSaveProofHook: saveProofToDB,
  };
}
