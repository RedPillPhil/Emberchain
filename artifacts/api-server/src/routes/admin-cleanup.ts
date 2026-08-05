/**
 * One-shot admin cleanup route — removes fake DEX orders and backfills missing
 * native_bridge_address entries. Protected by CHAIN_NODE_INTERNAL_SECRET.
 * DELETE THIS FILE after the production cleanup is confirmed.
 */

import { Router } from "express";
import pg from "pg";
import { isOperator } from "../lib/operator-auth";
import { logger } from "../lib/logger";

const router = Router();

const pool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

router.post("/admin/cleanup", async (req, res) => {
  if (!isOperator(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results: Record<string, unknown> = {};

  try {
    // 1. Cancel the fake wPOOP DEX order
    const del = await pool.query(
      `UPDATE dex_orders SET status = 'cancelled'
       WHERE hash = '0x8fdf312264b4839232b58a21b710f207ba08fe2998910f5ebab2105f4edb181a'
         AND status = 'open'
       RETURNING hash`,
    );
    results.cancelledFakeOrder = del.rowCount ?? 0;
    logger.info({ rows: del.rowCount }, "[admin-cleanup] cancelled fake wPOOP order");

    // 2. Backfill wPEPE native_bridge_address (secp256k1 + base58 = P2PKH)
    const upd = await pool.query(
      `UPDATE token_launches
       SET native_bridge_address = '1Ns8vQLfLUCafS1q7yPKi22NKp8YuF1Km5',
           bridge_wallet_address  = '1Ns8vQLfLUCafS1q7yPKi22NKp8YuF1Km5',
           updated_at = NOW()
       WHERE id = 'cd0f466e-4fd3-4b90-978c-f31b35e7a5d6'
         AND native_bridge_address IS NULL
       RETURNING id, symbol, native_bridge_address`,
    );
    results.backfilledWpepe = upd.rowCount ?? 0;
    logger.info({ rows: upd.rowCount }, "[admin-cleanup] backfilled wPEPE native_bridge_address");

    res.json({ ok: true, results });
  } catch (err) {
    logger.error({ err }, "[admin-cleanup] failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
