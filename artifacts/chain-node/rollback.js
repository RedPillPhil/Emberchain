/**
 * Pre-start rollback script.
 * When ROLLBACK_TO_HEIGHT is set, truncates the canonical chain in PostgreSQL
 * to that block height before the main chain-node process loads the DB.
 * Run this before index.mjs to ensure the chain loads at the correct height.
 *
 * Usage (via artifact.toml run args):
 *   sh -c "node artifacts/chain-node/rollback.js && node --enable-source-maps artifacts/chain-node/dist/index.mjs"
 */

import pg from "pg";

const HEIGHT = parseInt(process.env.ROLLBACK_TO_HEIGHT || "0", 10);

if (!HEIGHT || HEIGHT < 1) {
  console.log("[rollback] ROLLBACK_TO_HEIGHT not set — skipping.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log("[rollback] No DATABASE_URL — skipping.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  // Read the current block count and highest block number from the DB JSON.
  const peek = await pool.query(`
    SELECT
      jsonb_array_length(data->'blocks') AS total,
      (data->'blocks'->-1->>'number')::int AS tip
    FROM chain_state WHERE id = 'main'
  `);

  if (!peek.rows[0]) {
    console.log("[rollback] No chain_state row found — nothing to truncate.");
    process.exit(0);
  }

  const { total, tip } = peek.rows[0];
  console.log(`[rollback] DB chain: ${total} entries, tip block ${tip}. Target: ${HEIGHT}`);

  if (tip <= HEIGHT) {
    console.log("[rollback] Already at or below target height — skipping.");
    process.exit(0);
  }

  // Truncate the blocks JSON array to keep only blocks with number <= HEIGHT.
  // Uses PostgreSQL jsonb_agg so we never have to load the full blob into Node.
  console.log(`[rollback] Truncating chain from block ${tip} → ${HEIGHT} …`);
  await pool.query(`
    UPDATE chain_state
    SET
      data = jsonb_set(
        data,
        '{blocks}',
        (
          SELECT COALESCE(jsonb_agg(b ORDER BY (b->>'number')::int), '[]'::jsonb)
          FROM jsonb_array_elements(data->'blocks') b
          WHERE (b->>'number')::int <= $1
        )
      ),
      updated_at = NOW()
    WHERE id = 'main'
  `, [HEIGHT]);

  // Confirm the new tip.
  const check = await pool.query(`
    SELECT (data->'blocks'->-1->>'number')::int AS new_tip
    FROM chain_state WHERE id = 'main'
  `);
  console.log(`[rollback] Done. New tip: block ${check.rows[0]?.new_tip ?? "?"}`);
} catch (err) {
  console.error("[rollback] Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
