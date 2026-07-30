import { Router, type Request, type Response } from "express";
import { chain } from "../lib/chain";
import { addPeer, getPeers, broadcastBlock } from "../lib/peers";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const router = Router();

/**
 * Hard cap on concurrent importBlock operations inside chain-node itself.
 *
 * chain-node receives submit-block requests from TWO paths:
 *   1. Via api-server proxy (/api/sync/submit-block) — already capped at 3
 *   2. Directly via Replit path routing (/chain-node/api/sync/submit-block)
 *      — completely uncapped, bypasses api-server entirely
 *
 * Each importBlock holds the EVM lock for ~200–500 ms.  Without this cap
 * chain-node queues 30+ blocks, its event loop is saturated for 6–15 s,
 * and all wallet / status reads (which don't touch the lock) still can't
 * get HTTP responses out because the event loop is full of queued promise
 * continuations from the backed-up importBlock chain.
 *
 * Allowing 2 concurrent means at most ~1 s of queued EVM work.
 * Anything beyond that gets an immediate 429 — miners retry immediately.
 */
let blockImportInFlight = 0;
const MAX_BLOCK_IMPORT_CONCURRENT = 2;

router.get("/sync/status", async (_req: Request, res: Response): Promise<void> => {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
  try {
    const status = await Promise.race([chain.getStatus(), timeout]);
    res.json({ latestBlock: status.height, difficulty: status.difficulty, totalDifficulty: chain.getTotalDifficulty().toString(), chainId: 7773, network: "emberchain" });
  } catch {
    res.status(503).json({ error: "Node starting up, try again shortly", chainId: 7773, network: "emberchain" });
  }
});

router.get("/sync/snapshot", async (_req: Request, res: Response): Promise<void> => {
  try {
    await (chain as unknown as { whenReady: () => Promise<void> }).whenReady?.();
    const snapshot = chain.exportSnapshot();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Block-Height", String(snapshot.blocks.length));
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Snapshot failed" });
  }
});

router.get("/sync/blocks", async (req: Request, res: Response): Promise<void> => {
  try {
    const from  = Math.max(0, parseInt(String(req.query.from  ?? "0"), 10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit ?? "500"), 10) || 500));
    const blocks = await chain.getBlocksFrom(from, limit);
    const nextFrom = blocks.length > 0 ? blocks[blocks.length - 1]!.number + 1 : from;
    res.json({ blocks, nextFrom, hasMore: blocks.length === limit });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

router.get("/sync/peers", (_req: Request, res: Response): void => {
  res.json({ peers: getPeers() });
});

router.post("/sync/submit-block", async (req: Request, res: Response): Promise<void> => {
  if (blockImportInFlight >= MAX_BLOCK_IMPORT_CONCURRENT) {
    res.status(429).json({ error: "Node busy — retry shortly." });
    return;
  }
  blockImportInFlight++;
  try {
    const { block, transactions, fromPeer } = req.body as { block: StoredBlock; transactions: StoredTransaction[]; fromPeer?: string };
    if (!block || typeof block.number !== "number" || !block.hash || !block.nonce) {
      res.status(400).json({ error: "Missing or malformed block fields" });
      return;
    }
    if (fromPeer) addPeer(fromPeer);
    const imported = await chain.importBlock(block, transactions ?? []);
    broadcastBlock(imported, transactions ?? [], fromPeer).catch(() => {});
    res.json({ accepted: true, hash: imported.hash, number: imported.number });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Block import failed";
    const status = msg.includes("does not extend") || msg.includes("already") ? 409 : 400;
    res.status(status).json({ error: msg });
  } finally {
    blockImportInFlight--;
  }
});

router.post("/sync/peers", (req: Request, res: Response): void => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    res.status(400).json({ error: "url must be a valid http(s) URL" });
    return;
  }
  addPeer(url);
  res.json({ ok: true, peers: getPeers() });
});

/**
 * Admin: force this node to abandon its current chain and adopt a fresh
 * snapshot from the given peer.  Used to resolve chain forks manually.
 * POST /api/sync/force-resync  { "peer": "https://emberchain.duckdns.org" }
 */
router.post("/sync/force-resync", async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CHAIN_NODE_INTERNAL_SECRET ?? process.env.SESSION_SECRET;
  const auth   = req.headers["x-internal-secret"];
  if (!secret || auth !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { peer } = req.body as { peer?: string };
  if (!peer || !peer.startsWith("http")) {
    res.status(400).json({ error: "peer URL required" });
    return;
  }
  try {
    console.log(`[admin] force-resync: downloading snapshot from ${peer} …`);
    const r = await fetch(`${peer}/api/sync/snapshot`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`Snapshot fetch failed: ${r.status}`);
    const snapshot = await r.json() as Parameters<typeof chain.importSnapshot>[0];
    if (!Array.isArray((snapshot as {blocks?: unknown}).blocks) || (snapshot as {blocks: unknown[]}).blocks.length === 0) {
      throw new Error("Empty snapshot received");
    }
    await chain.importSnapshot(snapshot);
    const status = await chain.getStatus();
    console.log(`[admin] force-resync complete — now at block ${status.height}`);
    res.json({ ok: true, height: status.height });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin] force-resync failed: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

export default router;
