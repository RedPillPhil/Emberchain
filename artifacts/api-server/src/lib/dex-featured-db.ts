/**
 * Featured Base ERC-20 tokens for Ember Delta — operator-curated market list.
 */

import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export interface FeaturedToken {
  tokenAddress: string;
  symbol: string;
  name: string;
  isOfficial: boolean;
  created_at?: Date;
}

export async function ensureFeaturedTokensTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dex_featured_tokens (
      address     TEXT PRIMARY KEY,
      symbol      TEXT NOT NULL,
      name        TEXT NOT NULL,
      is_official BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dex_hidden_tokens (
      address     TEXT PRIMARY KEY,
      symbol      TEXT,
      reason      TEXT,
      hidden_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function listHiddenAddresses(): Promise<Set<string>> {
  const res = await pool.query<{ address: string }>(
    "SELECT address FROM dex_hidden_tokens",
  );
  return new Set(res.rows.map((r) => r.address.toLowerCase()));
}

export async function hideToken(data: {
  address: string;
  symbol?: string;
  reason?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO dex_hidden_tokens (address, symbol, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (address) DO UPDATE SET
       symbol = COALESCE(EXCLUDED.symbol, dex_hidden_tokens.symbol),
       reason = COALESCE(EXCLUDED.reason, dex_hidden_tokens.reason),
       hidden_at = NOW()`,
    [data.address.toLowerCase(), data.symbol ?? null, data.reason ?? null],
  );
}

export async function isTokenHidden(address: string): Promise<boolean> {
  const res = await pool.query<{ address: string }>(
    "SELECT address FROM dex_hidden_tokens WHERE address = $1",
    [address.toLowerCase()],
  );
  return res.rows.length > 0;
}

export async function listFeaturedTokens(visibleOnly = true): Promise<FeaturedToken[]> {
  const res = await pool.query<{
    address: string;
    symbol: string;
    name: string;
    is_official: boolean;
    created_at: Date;
  }>(
    visibleOnly
      ? `SELECT f.address, f.symbol, f.name, f.is_official, f.created_at
         FROM dex_featured_tokens f
         LEFT JOIN dex_hidden_tokens h ON h.address = f.address
         WHERE h.address IS NULL
         ORDER BY f.created_at ASC`
      : "SELECT address, symbol, name, is_official, created_at FROM dex_featured_tokens ORDER BY created_at ASC",
  );
  return res.rows.map((r) => ({
    tokenAddress: r.address,
    symbol: r.symbol,
    name: r.name,
    isOfficial: r.is_official,
    created_at: r.created_at,
  }));
}

export async function upsertFeaturedToken(data: {
  address: string;
  symbol: string;
  name: string;
  isOfficial?: boolean;
}): Promise<FeaturedToken> {
  const addr = data.address.toLowerCase();
  const res = await pool.query<{
    address: string;
    symbol: string;
    name: string;
    is_official: boolean;
    created_at: Date;
  }>(
    `INSERT INTO dex_featured_tokens (address, symbol, name, is_official)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (address) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       name = EXCLUDED.name,
       is_official = EXCLUDED.is_official
     RETURNING address, symbol, name, is_official, created_at`,
    [addr, data.symbol, data.name, data.isOfficial ?? true],
  );
  const r = res.rows[0];
  return {
    tokenAddress: r.address,
    symbol: r.symbol,
    name: r.name,
    isOfficial: r.is_official,
    created_at: r.created_at,
  };
}

export async function deleteFeaturedToken(address: string): Promise<boolean> {
  const res = await pool.query(
    "DELETE FROM dex_featured_tokens WHERE address = $1",
    [address.toLowerCase()],
  );
  return (res.rowCount ?? 0) > 0;
}
