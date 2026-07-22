/**
 * Peer-sync endpoints for standalone Emberchain nodes.
 *
 * READ (any node can pull from any other node):
 *   GET /api/sync/status        — quick liveness check (height + difficulty)
 *   GET /api/sync/snapshot      — full chain export for bootstrapping
 *   GET /api/sync/blocks        — incremental block batch since block N
 *   GET /api/sync/peers         — list of known peer URLs
 *
 * WRITE (P2P gossip):
 *   POST /api/sync/submit-block — push a peer-mined block; validates PoW,
 *                                 imports it, then fans out to other peers
 *   POST /api/sync/peers        — register a peer URL so we broadcast to it
 *
 * Access is intentionally public — read endpoints are anonymous, write
 * endpoints validate the block's proof-of-work before accepting anything.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { chain } from "../lib/chain";
import { addPeer, getPeers, broadcastBlock } from "../lib/peers";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const router: IRouter = Router();

// ── Read endpoints ─────────────────────────────────────────────────────────────

/** Quick liveness / height check without pulling the full snapshot. */
router.get("/sync/status", async (_req: Request, res: Response): Promise<void> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 8000));
  try {
    const status = await Promise.race([chain.getStatus(), timeout]);
    res.status(200).json({
      latestBlock:     status.height,
      difficulty:      status.difficulty,
      totalDifficulty: status.totalDifficulty,
      chainId:         7773,
      network:         "emberchain",
    });
  } catch {
    // Node is still initialising or under heavy load — return what we can
    res.status(503).json({ error: "Node starting up, try again shortly", chainId: 7773, network: "emberchain" });
  }
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
 */
router.get("/sync/blocks", async (req: Request, res: Response): Promise<void> => {
  try {
    const from  = Math.max(0, parseInt(String(req.query.from  ?? "0"),   10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit ?? "500"), 10) || 500));
    const blocks = await chain.getBlocksFrom(from, limit);
    const nextFrom = blocks.length > 0 ? blocks[blocks.length - 1]!.number + 1 : from;
    res.status(200).json({ blocks, nextFrom, hasMore: blocks.length === limit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

/** Returns the list of peer URLs this node knows about. */
router.get("/sync/peers", (_req: Request, res: Response): void => {
  res.status(200).json({ peers: getPeers() });
});

// ── Write endpoints ────────────────────────────────────────────────────────────

/**
 * POST /api/sync/submit-block
 *
 * A peer node pushes a newly-mined block.  This endpoint:
 *   1. Validates the proof-of-work and block structure.
 *   2. Imports the block into our local chain (re-executes transactions).
 *   3. Gossips the block to all other known peers (excluding the sender).
 *
 * Body: { block: StoredBlock, transactions: StoredTransaction[], fromPeer?: string }
 */
router.post("/sync/submit-block", async (req: Request, res: Response): Promise<void> => {
  try {
    const { block, transactions, fromPeer } = req.body as {
      block: StoredBlock;
      transactions: StoredTransaction[];
      fromPeer?: string;
    };

    if (!block || typeof block.number !== "number" || !block.hash || !block.nonce) {
      res.status(400).json({ error: "Missing or malformed block fields" });
      return;
    }

    // Register the sender as a known peer (automatic gossip learning)
    if (fromPeer) addPeer(fromPeer);

    const imported = await chain.importBlock(block, transactions ?? []);

    // Fan out to all other peers — do not await (fire and forget)
    broadcastBlock(imported, transactions ?? [], fromPeer).catch(() => {});

    res.status(200).json({ accepted: true, hash: imported.hash, number: imported.number });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Block import failed";
    // 409 = stale (we already have it or it's behind our tip) — not an error
    const status = msg.includes("does not extend") || msg.includes("already") ? 409 : 400;
    res.status(status).json({ error: msg });
  }
});

/**
 * POST /api/sync/peers
 *
 * Register a peer URL so this node broadcasts new blocks to it.
 * Body: { url: string }
 */
router.post("/sync/peers", (req: Request, res: Response): void => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    res.status(400).json({ error: "url must be a valid http(s) URL" });
    return;
  }
  addPeer(url);
  res.status(200).json({ ok: true, peers: getPeers() });
});

export default router;
