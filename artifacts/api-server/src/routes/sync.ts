/**
 * Peer-sync endpoints for standalone Emberchain nodes.
 *
 * GET /api/sync/status   — quick check: latest block height and difficulty
 * GET /api/sync/snapshot — full chain export (blocks + txs + EVM state) as JSON
 * GET /api/sync/blocks   — incremental blocks-only batch for catching up after snapshot
 *
 * The snapshot can be several MB once the chain matures.  The client (standalone
 * node) should download it once at startup, save to disk, then use /sync/blocks
 * with ?from=<latest+1> to stay in sync.
 *
 * Access is intentionally public (read-only) so anyone can spin up a node.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { chain } from "../lib/chain";

const router: IRouter = Router();

/** Quick liveness / height check without pulling the full snapshot. */
router.get("/sync/status", async (_req: Request, res: Response): Promise<void> => {
  const status = await chain.getStatus();
  res.status(200).json({
    latestBlock: status.height,
    difficulty: status.difficulty,
    chainId: 7773,
    network: "emberchain",
  });
});

/**
 * Full snapshot — the entire PersistedChain payload.
 * A bootstrapping node downloads this once, then uses /sync/blocks for incremental updates.
 */
router.get("/sync/snapshot", async (_req: Request, res: Response): Promise<void> => {
  try {
    await (chain as unknown as { whenReady: () => Promise<void> }).whenReady?.();
    const snapshot = chain.exportSnapshot();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Block-Height", String(snapshot.blocks.length));
    // Send without Zod validation — the schema is the internal PersistedChain type.
    res.status(200).json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Snapshot failed" });
  }
});

/**
 * Incremental block sync.
 * Query params:
 *   from  — starting block number (inclusive, default 0)
 *   limit — max blocks to return (default 500, capped at 1000)
 *
 * Each item includes the block header + its transactions.
 * The response also includes `nextFrom` so the client can page through history.
 */
router.get("/sync/blocks", async (req: Request, res: Response): Promise<void> => {
  try {
    const from = Math.max(0, parseInt(String(req.query.from ?? "0"), 10) || 0);
    const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit ?? "500"), 10) || 500));
    const blocks = await chain.getBlocksFrom(from, limit);
    const nextFrom = blocks.length > 0 ? blocks[blocks.length - 1].number + 1 : from;
    res.status(200).json({ blocks, nextFrom, hasMore: blocks.length === limit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

export default router;
