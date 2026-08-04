/**
 * Contract Registry — PostgreSQL when DATABASE_URL is set, else local JSON file.
 * Written by chain-node's scanner; api-server reads the same Postgres table when configured.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH =
  process.env.CONTRACT_REGISTRY_FILE ??
  path.join(__dirname, "..", "..", "data", "contract-registry.json");

const usePg = Boolean(process.env.DATABASE_URL?.trim());

const pool = usePg
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
    })
  : null;

if (pool) {
  pool.on("error", (err) => {
    console.error("[contract-registry] Pool error:", err.message);
  });
}

export interface ContractRecord {
  address: string;
  abi: object[] | null;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  isToken: boolean;
  creator: string | null;
  creatorTx: string | null;
  createdAt: string;
}

export function registryBackend(): "postgres" | "file" {
  return usePg ? "postgres" : "file";
}

function rowToRecord(row: Record<string, unknown>): ContractRecord {
  return {
    address:     row["address"] as string,
    abi:         (row["abi"] as object[] | null) ?? null,
    name:        (row["name"] as string | null) ?? null,
    symbol:      (row["symbol"] as string | null) ?? null,
    decimals:    (row["decimals"] as number | null) ?? null,
    totalSupply: (row["total_supply"] as string | null) ?? null,
    isToken:     (row["is_token"] as boolean) ?? false,
    creator:     (row["creator"] as string | null) ?? null,
    creatorTx:   (row["creator_tx"] as string | null) ?? null,
    createdAt:   row["created_at"] instanceof Date
      ? row["created_at"].toISOString()
      : String(row["created_at"] ?? new Date().toISOString()),
  };
}

async function readFileStore(): Promise<Map<string, ContractRecord>> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const arr = JSON.parse(raw) as ContractRecord[];
    const map = new Map<string, ContractRecord>();
    for (const r of arr) map.set(r.address.toLowerCase(), r);
    return map;
  } catch {
    return new Map();
  }
}

async function writeFileStore(map: Map<string, ContractRecord>): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const arr = [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await fs.writeFile(FILE_PATH, JSON.stringify(arr, null, 2), "utf8");
}

export async function ensureContractTable(): Promise<void> {
  if (!usePg || !pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contract_registry (
        address      TEXT PRIMARY KEY,
        abi          JSONB,
        name         TEXT,
        symbol       TEXT,
        decimals     INT,
        total_supply TEXT,
        is_token     BOOLEAN NOT NULL DEFAULT false,
        creator      TEXT,
        creator_tx   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error("[contract-registry] Schema error:", (err as Error).message);
  }
}

export async function upsertContractRecord(data: {
  address: string;
  abi?: object[] | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  totalSupply?: string | null;
  isToken?: boolean;
  creator?: string | null;
  creatorTx?: string | null;
}): Promise<void> {
  const addr = data.address.toLowerCase();

  if (usePg && pool) {
    await pool.query(
      `INSERT INTO contract_registry
        (address, abi, name, symbol, decimals, total_supply, is_token, creator, creator_tx)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (address) DO UPDATE SET
         abi          = COALESCE($2, contract_registry.abi),
         name         = COALESCE($3, contract_registry.name),
         symbol       = COALESCE($4, contract_registry.symbol),
         decimals     = COALESCE($5, contract_registry.decimals),
         total_supply = COALESCE($6, contract_registry.total_supply),
         is_token     = CASE WHEN $7 THEN $7 ELSE contract_registry.is_token END,
         creator      = COALESCE($8, contract_registry.creator),
         creator_tx   = COALESCE($9, contract_registry.creator_tx),
         updated_at   = NOW()`,
      [
        addr,
        data.abi !== undefined ? JSON.stringify(data.abi) : null,
        data.name ?? null,
        data.symbol ?? null,
        data.decimals ?? null,
        data.totalSupply ?? null,
        data.isToken ?? false,
        data.creator ?? null,
        data.creatorTx ?? null,
      ],
    );
    return;
  }

  const store = await readFileStore();
  const prev = store.get(addr);
  const record: ContractRecord = {
    address:     addr,
    abi:         data.abi !== undefined ? data.abi ?? null : prev?.abi ?? null,
    name:        data.name ?? prev?.name ?? null,
    symbol:      data.symbol ?? prev?.symbol ?? null,
    decimals:    data.decimals ?? prev?.decimals ?? null,
    totalSupply: data.totalSupply ?? prev?.totalSupply ?? null,
    isToken:     data.isToken ?? prev?.isToken ?? false,
    creator:     data.creator ?? prev?.creator ?? null,
    creatorTx:   data.creatorTx ?? prev?.creatorTx ?? null,
    createdAt:   prev?.createdAt ?? new Date().toISOString(),
  };
  store.set(addr, record);
  await writeFileStore(store);
}

export async function getContractRecord(address: string): Promise<ContractRecord | null> {
  const addr = address.toLowerCase();
  if (usePg && pool) {
    try {
      const res = await pool.query(
        "SELECT * FROM contract_registry WHERE address = $1",
        [addr],
      );
      return res.rows[0] ? rowToRecord(res.rows[0]) : null;
    } catch { return null; }
  }
  const store = await readFileStore();
  return store.get(addr) ?? null;
}

export async function listTokens(): Promise<ContractRecord[]> {
  if (usePg && pool) {
    const res = await pool.query(
      "SELECT * FROM contract_registry WHERE is_token = true ORDER BY created_at ASC",
    );
    return res.rows.map(rowToRecord);
  }
  const store = await readFileStore();
  return [...store.values()].filter((r) => r.isToken).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listContracts(): Promise<ContractRecord[]> {
  if (usePg && pool) {
    const res = await pool.query(
      "SELECT * FROM contract_registry ORDER BY created_at DESC",
    );
    return res.rows.map(rowToRecord);
  }
  const store = await readFileStore();
  return [...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
