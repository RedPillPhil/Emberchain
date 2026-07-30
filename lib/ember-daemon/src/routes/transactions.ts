import { Router, type Request, type Response } from "express";
import {
  CreateTransactionBody, CreateTransactionResponse,
  ListTransactionsQueryParams, ListTransactionsResponse,
  GetTransactionParams, GetTransactionResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain.js";
import { syncAndWait, isChainSynced } from "../lib/sync-loop.js";

const router = Router();

router.post("/transactions", async (req: Request, res: Response): Promise<void> => {
  const body = CreateTransactionBody.parse(req.body ?? {});
  if (!isChainSynced()) await syncAndWait(5_000);
  try {
    const tx = await chain.submitTransaction(body);
    res.status(201).json(CreateTransactionResponse.parse(tx));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to submit transaction" });
  }
});

router.get("/transactions", async (req: Request, res: Response): Promise<void> => {
  const query = ListTransactionsQueryParams.parse(req.query);
  const txs = await chain.listTransactions(query.address, query.limit);
  const lean = txs.map(({ data: _d, returnData: _r, ...rest }) => rest);
  res.json(lean);
});

router.get("/transactions/:hash", async (req: Request, res: Response): Promise<void> => {
  const params = GetTransactionParams.parse(req.params);
  const tx = await chain.getTransaction(params.hash);
  if (!tx) { res.status(404).json({ error: `Transaction ${params.hash} not found` }); return; }
  res.json(GetTransactionResponse.parse(tx));
});

export default router;
