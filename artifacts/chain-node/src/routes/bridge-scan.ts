/**
 * Server-side Base bridge event scan — browsers cannot reliably call eth_getLogs on Base RPC (CORS).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getBaseProvider } from "../lib/base-provider";
import { scanBaseBridgeOuts, fetchBaseBridgeOutByTxHash } from "../lib/base-bridge-scan";
import { listPendingByDirection } from "../lib/bridge-store";

const router: IRouter = Router();

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

    const registered = await listPendingByDirection("base_to_embr");
    const registeredEvents = registered.map((e) => ({
      nonce: e.nonce,
      sender: e.sender,
      embrRecipient: e.recipient,
      amount: e.amount,
      txHash: e.txHashSrc ?? "",
      blockNumber: 0,
      submittedAt: e.createdAt,
      source: "registered" as const,
    }));

    const chainEvents = await scanBaseBridgeOuts(lookback);
    const chainMapped = await Promise.all(
      chainEvents.map(async (ev) => {
        let submittedAt: string | undefined;
        try {
          const block = await provider.getBlock(ev.blockNumber);
          submittedAt = block?.timestamp
            ? new Date(block.timestamp * 1000).toISOString()
            : undefined;
        } catch {
          /* optional */
        }
        return {
          ...ev,
          submittedAt,
          source: "chain" as const,
        };
      }),
    );

    const byNonce = new Map<string, (typeof registeredEvents)[0]>();
    for (const ev of registeredEvents) {
      byNonce.set(ev.nonce, ev);
    }
    for (const ev of chainMapped) {
      if (!byNonce.has(ev.nonce)) byNonce.set(ev.nonce, ev);
    }

    res.json([...byNonce.values()]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/bridge/base-out/:txHash", async (req: Request, res: Response): Promise<void> => {
  try {
    const txHash = req.params.txHash;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      res.status(400).json({ error: "txHash must be a valid 32-byte hex string" });
      return;
    }
    const parsed = await fetchBaseBridgeOutByTxHash(txHash);
    if (!parsed) {
      res.status(404).json({ error: "No BridgeOut event found in this Base transaction" });
      return;
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
