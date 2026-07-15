import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetMiningStatusResponse,
  StartMiningBody,
  StartMiningResponse,
  StopMiningResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";

const router: IRouter = Router();

router.get("/mining/status", async (_req: Request, res: Response): Promise<void> => {
  const status = chain.getMiningStatus();
  res.status(200).json(GetMiningStatusResponse.parse(status));
});

router.post("/mining/start", async (req: Request, res: Response): Promise<void> => {
  const body = StartMiningBody.parse(req.body ?? {});
  try {
    const status = await chain.startMining(body.minerAddress);
    res.status(200).json(StartMiningResponse.parse(status));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start mining" });
  }
});

router.post("/mining/stop", async (_req: Request, res: Response): Promise<void> => {
  const status = await chain.stopMining();
  res.status(200).json(StopMiningResponse.parse(status));
});

export default router;
