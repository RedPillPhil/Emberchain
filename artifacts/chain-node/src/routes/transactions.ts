import { Router, type Request, type Response } from "express";
import {
  CreateTransactionBody, CreateTransactionResponse,
  ListTransactionsQueryParams, ListTransactionsResponse,
  GetTransactionParams, GetTransactionResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { getBridgeEventByTxHash, markBridgeFailed } from "../lib/bridge-store";
import { syncAndWait, isChainSynced } from "../lib/sync-loop";

const router = Router();

router.post("/transactions", async (req: Request, res: Response): Promise<void> => {
  try {
    let body;
    try {
      body = CreateTransactionBody.parse(req.body ?? {});
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Invalid transaction body",
      });
      return;
    }
    // Ensure the local chain is current before accepting the transaction.
    if (!isChainSynced()) await syncAndWait(5_000);
    try {
      const tx = await chain.submitTransaction(body);
      try {
        res.status(201).json(CreateTransactionResponse.parse(tx));
      } catch {
        // Never return HTML 500 from a response-shape mismatch — send the raw tx.
        res.status(201).json(tx);
      }
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to submit transaction" });
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to submit transaction",
      });
    }
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
  const payload = GetTransactionResponse.parse(tx) as Record<string, unknown>;
  if (tx.status === "pending") {
    payload.orphaned = chain.isOrphanedPending(params.hash);
  }
  res.json(payload);
});

/** Drop a stuck pending tx — marks it failed so the UI stops showing "In Mempool". */
router.post("/transactions/:hash/drop", async (req: Request, res: Response): Promise<void> => {
  try {
    const params = GetTransactionParams.parse(req.params);
    const tx = await chain.dropPendingTransaction(params.hash);

    const bridgeEvent = await getBridgeEventByTxHash(params.hash);
    if (bridgeEvent && bridgeEvent.status === "pending") {
      await markBridgeFailed(
        bridgeEvent.nonce,
        bridgeEvent.direction,
        tx.error ?? "Source transaction dropped from mempool",
      );
    }

    res.json(GetTransactionResponse.parse(tx));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to drop transaction" });
  }
});

export default router;
