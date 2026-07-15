import { Router, type IRouter, type Request, type Response } from "express";
import { CallContractBody, CallContractResponse } from "@workspace/api-zod";
import { chain } from "../lib/chain";

const router: IRouter = Router();

router.post("/contracts/call", async (req: Request, res: Response): Promise<void> => {
  const body = CallContractBody.parse(req.body ?? {});
  try {
    const result = await chain.callContract(body);
    res.status(200).json(CallContractResponse.parse(result));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Call failed" });
  }
});

export default router;
