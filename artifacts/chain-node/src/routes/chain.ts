import { Router, type Request, type Response } from "express";
import {
  GetChainStatusResponse, ListBlocksQueryParams, ListBlocksResponse,
  GetBlockParams, GetBlockResponse,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { chainStatusCache } from "../lib/status-cache";

const router = Router();

router.get("/chain/status", async (_req: Request, res: Response): Promise<void> => {
  const cached = chainStatusCache.get();
  if (cached) { res.json(cached); return; }
  const status = GetChainStatusResponse.parse(await chain.getStatus());
  chainStatusCache.set(status);
  res.json(status);
});

router.get("/chain/blocks", async (req: Request, res: Response): Promise<void> => {
  const query = ListBlocksQueryParams.parse(req.query);
  const blocks = await chain.listBlocks(query.limit);
  const summaries = blocks.map((block) => ({
    number: block.number, hash: block.hash, parentHash: block.parentHash,
    timestamp: block.timestamp, miner: block.miner, difficulty: block.difficulty,
    transactionCount: block.transactionHashes.length, nonce: block.nonce, payouts: block.payouts,
  }));
  res.json(ListBlocksResponse.parse(summaries));
});

router.get("/chain/blocks/:number", async (req: Request, res: Response): Promise<void> => {
  const params = GetBlockParams.parse(req.params);
  const block = await chain.getBlock(params.number);
  if (!block) { res.status(404).json({ error: `Block ${params.number} not found` }); return; }
  res.json(GetBlockResponse.parse({
    number: block.number, hash: block.hash, parentHash: block.parentHash,
    timestamp: block.timestamp, miner: block.miner, difficulty: block.difficulty,
    transactionCount: block.transactionHashes.length, nonce: block.nonce,
    stateRoot: block.stateRoot, reward: block.reward, transactions: block.transactions,
    payouts: block.payouts,
  }));
});

export default router;
