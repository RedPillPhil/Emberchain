import { Router, type Request, type Response } from "express";
import { chain } from "../lib/chain";
import { addPeer, getPeers, broadcastBlock } from "../lib/peers";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";

const router = Router();

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

export default router;
