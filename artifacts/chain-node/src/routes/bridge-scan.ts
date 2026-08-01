/**
 * Server-side Base bridge event scan — browsers cannot reliably call eth_getLogs on Base RPC (CORS).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { Contract } from "ethers";
import { getBaseProvider } from "../lib/base-provider";

const router: IRouter = Router();

const EMBERCHAIN_BRIDGE_ADDRESS = (
  process.env.EMBERCHAIN_BRIDGE_ADDRESS ?? "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4"
).toLowerCase();

const BASE_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
] as const;

const LOG_CHUNK_SIZE = 10_000;

router.get("/bridge/base-outs", async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = getBaseProvider();
    if (!provider) {
      res.status(503).json({ error: "BASE_RPC_URL is not configured on chain-node" });
      return;
    }

    const lookbackRaw = Number(req.query.lookback ?? 50_000);
    const lookback = Number.isFinite(lookbackRaw)
      ? Math.min(Math.max(lookbackRaw, 1_000), 200_000)
      : 50_000;

    const baseBridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
    const baseHeight = await provider.getBlockNumber();
    const baseFrom = Math.max(0, baseHeight - lookback);

    const logs: Awaited<ReturnType<Contract["queryFilter"]>> = [];
    for (let from = baseFrom; from <= baseHeight; from += LOG_CHUNK_SIZE) {
      const to = Math.min(from + LOG_CHUNK_SIZE - 1, baseHeight);
      const chunk = await baseBridge.queryFilter(baseBridge.filters.BridgeOut(), from, to);
      logs.push(...chunk);
    }

    const events = [];
    for (const log of logs) {
      if (!("args" in log) || !log.args) continue;
      let blockTimestamp: number | undefined;
      try {
        const block = await provider.getBlock(log.blockNumber);
        blockTimestamp = block?.timestamp;
      } catch {
        /* optional */
      }
      events.push({
        nonce: (log.args[3] as bigint).toString(),
        sender: log.args[0] as string,
        embrRecipient: log.args[1] as string,
        amount: (log.args[2] as bigint).toString(),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        submittedAt: blockTimestamp ? new Date(blockTimestamp * 1000).toISOString() : undefined,
      });
    }

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
