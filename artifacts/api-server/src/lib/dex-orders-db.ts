/**
 * Off-chain orderbook storage for EmberDelta.
 *
 * Orders are signed off-chain (EIP-712) and stored here.
 * The on-chain contract handles settlement via trade().
 */

import pg from "pg";
import { ethers } from "ethers";
import { getBaseProvider } from "./base-provider";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                        // handle concurrent order-book polling
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[dex-orders-db] Pool error:", err.message);
});

export interface DexOrder {
  hash: string;
  token_get: string;
  amount_get: string;
  token_give: string;
  amount_give: string;
  expires: string;
  nonce: string;
  maker: string;
  v: number;
  r: string;
  s: string;
  status: "open" | "filled" | "cancelled";
  created_at: string;
}

export async function ensureDexOrdersTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dex_orders (
        hash        TEXT         PRIMARY KEY,
        token_get   TEXT         NOT NULL,
        amount_get  TEXT         NOT NULL,
        token_give  TEXT         NOT NULL,
        amount_give TEXT         NOT NULL,
        expires     TEXT         NOT NULL,
        nonce       TEXT         NOT NULL,
        maker       TEXT         NOT NULL,
        v           INT          NOT NULL,
        r           TEXT         NOT NULL,
        s           TEXT         NOT NULL,
        status      TEXT         NOT NULL DEFAULT 'open',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS dex_orders_token_get_idx  ON dex_orders (token_get);
      CREATE INDEX IF NOT EXISTS dex_orders_token_give_idx ON dex_orders (token_give);
      CREATE INDEX IF NOT EXISTS dex_orders_maker_idx      ON dex_orders (maker);
      CREATE INDEX IF NOT EXISTS dex_orders_status_idx     ON dex_orders (status);
      -- Composite index that satisfies the listOrders ORDER BY without a seq scan.
      -- Covers the common no-token-filter path: WHERE status = $1 ORDER BY created_at DESC.
      CREATE INDEX IF NOT EXISTS dex_orders_status_created_idx
        ON dex_orders (status, created_at DESC);
    `);
  } catch (err) {
    console.error("[dex-orders-db] Failed to create table:", (err as Error).message);
  }
}

export async function insertOrder(order: Omit<DexOrder, "status" | "created_at">): Promise<void> {
  await pool.query(
    `INSERT INTO dex_orders (hash, token_get, amount_get, token_give, amount_give, expires, nonce, maker, v, r, s)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (hash) DO NOTHING`,
    [
      order.hash,
      order.token_get.toLowerCase(),
      order.amount_get,
      order.token_give.toLowerCase(),
      order.amount_give,
      order.expires,
      order.nonce,
      order.maker.toLowerCase(),
      order.v,
      order.r,
      order.s,
    ],
  );
}

export async function listOrders(token?: string, status = "open"): Promise<DexOrder[]> {
  let query: string;
  let params: string[];

  if (token) {
    const t = token.toLowerCase();
    query = `SELECT * FROM dex_orders WHERE status = $1 AND (token_get = $2 OR token_give = $2) ORDER BY created_at DESC LIMIT 200`;
    params = [status, t];
  } else {
    query = `SELECT * FROM dex_orders WHERE status = $1 ORDER BY created_at DESC LIMIT 200`;
    params = [status];
  }

  const { rows } = await pool.query<DexOrder>(query, params);
  return rows;
}

export async function getOrder(hash: string): Promise<DexOrder | null> {
  const { rows } = await pool.query<DexOrder>(
    "SELECT * FROM dex_orders WHERE hash = $1 LIMIT 1",
    [hash],
  );
  return rows[0] ?? null;
}

/**
 * Updates order status only if the order exists and is currently `open`.
 * Returns:
 *   "ok"         — status changed successfully
 *   "not_found"  — no order with this hash exists
 *   "conflict"   — order exists but is not open (already filled/cancelled)
 */
export async function updateOrderStatus(
  hash: string,
  status: "filled" | "cancelled",
): Promise<"ok" | "not_found" | "conflict"> {
  const { rowCount } = await pool.query(
    `UPDATE dex_orders SET status = $1 WHERE hash = $2 AND status = 'open'`,
    [status, hash],
  );
  if ((rowCount ?? 0) > 0) return "ok";
  // Distinguish missing vs wrong-state
  const { rowCount: existing } = await pool.query(
    "SELECT 1 FROM dex_orders WHERE hash = $1",
    [hash],
  );
  return (existing ?? 0) > 0 ? "conflict" : "not_found";
}

// ---------------------------------------------------------------------------
// On-chain Trade event verification
// ---------------------------------------------------------------------------

// EmberDelta contract address on Base (same value as in the frontend contracts.ts)
const EMBER_DELTA_ADDRESS = (
  process.env["EMBER_DELTA_ADDRESS"] ?? "0x365f70E546e3D4D35745e7C91Cf189956E2fBEFA"
).toLowerCase();

// Topic 0 = keccak256("Trade(address,uint256,address,uint256,address,address,bytes32)")
const TRADE_TOPIC = ethers.id(
  "Trade(address,uint256,address,uint256,address,address,bytes32)",
);

/**
 * Verifies that a Base transaction receipt:
 *   1. Exists and has status = 1 (success)
 *   2. Contains a Trade event emitted by the EmberDelta contract
 *   3. The Trade event's orderHash field matches the expected order hash
 *
 * Returns a human-readable reason string on failure, or null on success.
 *
 * Fail-closed: if BASE_RPC_URL is not set outside of a development environment,
 * the check is rejected (not bypassed).  In NODE_ENV=development only, a missing
 * RPC is treated as "skip" so local dev flows without a live Base node still work.
 */
export async function verifyTradeOnChain(
  txHash: string,
  orderHash: string,
): Promise<string | null> {
  const provider = getBaseProvider();
  if (!provider) {
    if (process.env["NODE_ENV"] === "development") {
      // Dev mode — skip verification so local testing without a Base node works.
      return null;
    }
    return "BASE_RPC_URL is not configured — cannot verify on-chain settlement";
  }

  let receipt: ethers.TransactionReceipt | null;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (err) {
    return `Could not fetch tx receipt: ${(err as Error).message}`;
  }

  if (!receipt) return "Transaction not found on Base — it may still be pending";
  if (receipt.status !== 1) return "Transaction reverted on-chain";

  // Find a Trade log from the EmberDelta contract that matches this order hash.
  const normalizedOrder = orderHash.toLowerCase();
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== EMBER_DELTA_ADDRESS ||
      log.topics[0] !== TRADE_TOPIC
    ) continue;

    // Non-indexed data layout: amountGet(32) | amountGive(32) | maker(32) | orderHash(32)
    // orderHash starts at byte offset 96.
    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    if (data.length < 256) continue; // malformed
    const loggedOrderHash = "0x" + data.slice(192, 256); // bytes 96–128 → hex chars 192–256

    if (loggedOrderHash.toLowerCase() === normalizedOrder) return null; // ✅ verified
  }

  return "No matching Trade event found in tx — the transaction did not settle this order";
}

/**
 * Returns a lightweight ETag string for the current listOrders result set.
 * Uses row-count + latest created_at so the ETag changes whenever an order is
 * added; does not require reading all rows — O(1) index scan.
 */
export async function getOrdersETag(token?: string, status = "open"): Promise<string> {
  let query: string;
  let params: string[];
  if (token) {
    const t = token.toLowerCase();
    query = `SELECT COUNT(*)::text AS cnt, MAX(created_at)::text AS ts
             FROM dex_orders
             WHERE status = $1 AND (token_get = $2 OR token_give = $2)`;
    params = [status, t];
  } else {
    query = `SELECT COUNT(*)::text AS cnt, MAX(created_at)::text AS ts
             FROM dex_orders
             WHERE status = $1`;
    params = [status];
  }
  const { rows } = await pool.query<{ cnt: string; ts: string | null }>(query, params);
  const { cnt, ts } = rows[0] ?? { cnt: "0", ts: null };
  return `"${status}-${cnt}-${ts ?? "empty"}"`;
}
