import { Router, type Request, type Response } from "express";
import {
  GetMiningStatusResponse, StartMiningBody, StartMiningResponse,
  StopMiningResponse, SubmitBlockBody, SubmitShareBody, SubmitShareResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { miningStatusCache, chainStatusCache } from "../lib/status-cache";

const router = Router();

/**
 * Concurrency cap for share validation.
 * Rejects with 429 when too many shares are already in-flight so the event
 * loop always has headroom to serve health checks even under peak mining load.
 */
let shareInflight = 0;
const MAX_SHARE_INFLIGHT = 40;

router.get("/mining/status", (_req: Request, res: Response): void => {
  const cached = miningStatusCache.get();
  if (cached) { res.json(cached); return; }
  const status = GetMiningStatusResponse.parse(chain.getMiningStatus());
  miningStatusCache.set(status);
  res.json(status);
});

router.post("/mining/start", async (req: Request, res: Response): Promise<void> => {
  const body = StartMiningBody.parse(req.body ?? {});
  try {
    const status = await chain.startMining(body.minerAddress, body.intensity ?? 2);
    miningStatusCache.invalidate();
    res.json(StartMiningResponse.parse(status));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start mining" });
  }
});

router.post("/mining/stop", async (_req: Request, res: Response): Promise<void> => {
  const status = await chain.stopMining();
  miningStatusCache.invalidate();
  res.json(StopMiningResponse.parse(status));
});

router.get("/mining/template", async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await chain.getMiningTemplate(String(req.query.minerAddress ?? "")));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to get template" });
  }
});

router.post("/mining/submit", async (req: Request, res: Response): Promise<void> => {
  const body = SubmitBlockBody.parse(req.body);
  try {
    const result = await chain.submitMinedBlock(body);
    // Invalidate caches when a new block is mined
    chainStatusCache.invalidate();
    miningStatusCache.invalidate();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Block submit failed";
    res.status(msg.includes("stale") || msg.includes("already") ? 409 : 400).json({ error: msg });
  }
});

router.post("/mining/share", async (req: Request, res: Response): Promise<void> => {
  if (shareInflight >= MAX_SHARE_INFLIGHT) {
    res.status(429).json({ error: "Too many concurrent share submissions — retry shortly" });
    return;
  }
  shareInflight++;
  try {
    const body = SubmitShareBody.parse(req.body);
    const result = await chain.submitShare(body);
    const parsed = SubmitShareResponse.parse(result);
    // If a block was found, invalidate status caches
    if (parsed.blockFound) {
      chainStatusCache.invalidate();
      miningStatusCache.invalidate();
    }
    res.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Share submission failed";
    res.status(msg.includes("stale") ? 409 : 400).json({ error: msg });
  } finally {
    shareInflight--;
  }
});

export default router;
