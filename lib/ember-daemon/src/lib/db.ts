/**
 * SQLite persistence for the standalone Emberchain daemon.
 * Replaces the PostgreSQL layer used in chain-node.
 *
 * better-sqlite3 is fully synchronous which lets us wrap calls in
 * Promise.resolve() to satisfy the async hooks that chain-core expects,
 * without ever truly awaiting I/O — SQLite writes are just file writes.
 */

import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PersistedChain } from "@workspace/chain-core";
import { daemonConfig } from "./config.js";

let _db: BetterSqlite3.Database | null = null;

function getDb(): BetterSqlite3.Database {
  if (_db) return _db;

  const { dataDir } = daemonConfig;
  mkdirSync(dataDir, { recursive: true });

  const dbPath = process.env.EMBER_DB_PATH ?? path.join(dataDir, "chain.db");
  _db = new BetterSqlite3(dbPath);

  // WAL mode: concurrent reads while a write is in progress
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("cache_size = -65536");   // 64 MB page cache
  _db.pragma("foreign_keys = ON");
  _db.pragma("temp_store = MEMORY");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS chain_state (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS used_payment_proofs (
      proof_key   TEXT PRIMARY KEY,
      currency    TEXT NOT NULL,
      tx_hash     TEXT NOT NULL,
      listing_id  TEXT NOT NULL,
      fulfilled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  return _db;
}

const STATE_ID = "main";

// ── Debounced save (same pattern as the PostgreSQL version) ───────────────────

let _pendingSave: PersistedChain | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 4_000;

function flushSave(): void {
  if (!_pendingSave) return;
  const payload = _pendingSave;
  _pendingSave = null;
  try {
    getDb()
      .prepare(
        `INSERT INTO chain_state (id, data, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(id) DO UPDATE
           SET data       = excluded.data,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(STATE_ID, JSON.stringify(payload));
  } catch (err) {
    console.error("[db] Could not save chain state:", (err as Error).message);
  }
}

export function saveChainToDB(data: PersistedChain): Promise<void> {
  _pendingSave = data;
  if (_saveTimer !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      flushSave();
      resolve();
    }, SAVE_DEBOUNCE_MS);
  });
}

// ── Load ──────────────────────────────────────────────────────────────────────

export function loadChainFromDB(): Promise<PersistedChain | null> {
  try {
    const row = getDb()
      .prepare("SELECT data FROM chain_state WHERE id = ?")
      .get(STATE_ID) as { data: string } | undefined;
    if (!row) return Promise.resolve(null);
    return Promise.resolve(JSON.parse(row.data) as PersistedChain);
  } catch (err) {
    console.error("[db] Could not load chain state:", (err as Error).message);
    return Promise.resolve(null);
  }
}

// ── Payment proofs ────────────────────────────────────────────────────────────

export function loadProofsFromDB(): Promise<string[]> {
  try {
    const rows = getDb()
      .prepare("SELECT proof_key FROM used_payment_proofs")
      .all() as { proof_key: string }[];
    return Promise.resolve(rows.map((r) => r.proof_key));
  } catch (err) {
    console.error("[db] Could not load proof keys:", (err as Error).message);
    return Promise.resolve([]);
  }
}

export function saveProofToDB(
  proofKey: string,
  currency: string,
  txHash: string,
  listingId: string,
): Promise<void> {
  try {
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO used_payment_proofs
           (proof_key, currency, tx_hash, listing_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(proofKey, currency, txHash, listingId);
  } catch (err) {
    console.error("[db] Could not save proof key:", (err as Error).message);
  }
  return Promise.resolve();
}

// ── Hook factory (same API as the PostgreSQL version) ─────────────────────────

export function createChainPersistenceHooks() {
  return {
    asyncLoadHook:      loadChainFromDB,
    asyncPersistHook:   saveChainToDB,
    asyncLoadProofsHook: loadProofsFromDB,
    asyncSaveProofHook:  saveProofToDB,
  };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** Flush any pending save and close the database.  Call on process exit. */
export function closeDb(): void {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; flushSave(); }
  if (_db) { _db.close(); _db = null; }
}
