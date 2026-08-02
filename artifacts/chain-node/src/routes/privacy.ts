/**
 * Public privacy pool API for wallet clients (emberchain.org → /api proxy).
 * Same handlers as /api/internal/privacy/* but without service auth.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { chain } from "../lib/chain";

const router: IRouter = Router();

router.get("/privacy/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await chain.getPrivacyStatus());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.get("/privacy/meta/:address", async (req: Request, res: Response): Promise<void> => {
  try {
    const meta = await chain.getStealthMeta(String(req.params["address"]));
    if (!meta) {
      res.status(404).json({ error: "No stealth meta-address found" });
      return;
    }
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.post("/privacy/balance", async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await chain.getPrivateBalance(req.body.privateKey));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.post("/privacy/shield", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await chain.shield(req.body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Shield failed" });
  }
});

router.post("/privacy/send", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await chain.privateSend(req.body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Private send failed" });
  }
});

router.post("/privacy/unshield", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await chain.unshield(req.body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Unshield failed" });
  }
});

router.get("/privacy/transactions", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    res.json(await chain.listPrivacyLedger(limit));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
