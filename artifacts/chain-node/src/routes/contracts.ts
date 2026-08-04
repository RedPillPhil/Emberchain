import { Router, type Request, type Response } from "express";
import { listTokens, listContracts } from "../lib/contract-registry";
import { rescanContracts } from "../lib/chain-scanner";

const router = Router();

router.get("/tokens", async (_req: Request, res: Response): Promise<void> => {
  try {
    const tokens = await listTokens();
    res.json(tokens);
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

router.get("/contracts/list", async (_req: Request, res: Response): Promise<void> => {
  try {
    const contracts = await listContracts();
    res.json(contracts);
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

router.post("/contracts/rescan", async (_req: Request, res: Response): Promise<void> => {
  try {
    const added = await rescanContracts(true);
    res.json({ success: true, discovered: added });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
  }
});

export default router;
