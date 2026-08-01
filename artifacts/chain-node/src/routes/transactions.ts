import { Router, type Request, type Response } from "express";
import {
  CreateTransactionBody, CreateTransactionResponse,
  ListTransactionsQueryParams, ListTransactionsResponse,
  GetTransactionParams, GetTransactionResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { syncAndWait, isChainSynced } from "../lib/sync-loop";

const router = Router();

router.post("/transactions", async (req: Request, res: Response): Promise<void> => {
  const body = CreateTransactionBody.parse(req.body ?? {});
  // Ensure the local chain is current before accepting the transaction.
  // If we've been in idle-sync mode (60s interval) the tip could be stale.
  // syncAndWait() completes within 5 s or proceeds anyway — never blocks the user.
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
  // When filtering by contract address (bridge admin scan), include calldata in one
  // response so the browser does not N+1 through a CDN proxy for each tx hash.
  if (query.address) {
    res.json(txs.map(({ returnData: _r, ...rest }) => rest));
    return;
  }
  // Strip calldata from general list responses — not needed for history views.
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
