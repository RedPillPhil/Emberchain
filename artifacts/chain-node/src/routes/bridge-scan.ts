/**
 * Server-side Base bridge event scan — browsers cannot reliably call eth_getLogs on Base RPC (CORS).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getBaseProvider } from "../lib/base-provider";
import { scanBaseBridgeOuts, fetchBaseBridgeOutByTxHash } from "../lib/base-bridge-scan";
import { listPendingByDirection } from "../lib/bridge-store";

const router: IRouter = Router();

type BaseOutRow = {
  nonce: string;
  sender: string;
  embrRecipient: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
  source: "registered" | "chain";
};

router.get("/bridge/base-outs", async (req: Request, res: Response): Promise<void> => {
  const registeredEvents: BaseOutRow[] = [];
  try {
    const registered = await listPendingByDirection("base_to_embr");
    for (const e of registered) {
      registeredEvents.push({
        nonce: e.nonce,
        sender: e.sender,
        embrRecipient: e.recipient,
        amount: e.amount,
        txHash: e.txHashSrc ?? "",
        blockNumber: 0,
        submittedAt: e.createdAt,
        source: "registered",
      });
    }
  } catch (err) {
    console.error("[bridge-scan] registered base_to_embr failed:", (err as Error).message);
  }

  const chainMapped: BaseOutRow[] = [];
  try {
    const provider = getBaseProvider();
    if (provider) {
      const lookbackRaw = Number(req.query.lookback ?? 10_000);
      const lookback = Number.isFinite(lookbackRaw)
        ? Math.min(Math.max(lookbackRaw, 1_000), 200_000)
        : 10_000;
      const chainEvents = await scanBaseBridgeOuts(lookback);
      for (const ev of chainEvents) {
        chainMapped.push({
          ...ev,
          source: "chain",
        });
      }
    }
  } catch (err) {
    console.error("[bridge-scan] chain scan failed:", (err as Error).message);
  }

  const byNonce = new Map<string, BaseOutRow>();
  for (const ev of registeredEvents) {
    byNonce.set(ev.nonce, ev);
  }
  for (const ev of chainMapped) {
    if (!byNonce.has(ev.nonce)) byNonce.set(ev.nonce, ev);
  }

  res.json([...byNonce.values()]);
});

router.get("/bridge/pending-base-outs", async (_req: Request, res: Response): Promise<void> => {
  try {
    const registered = await listPendingByDirection("base_to_embr");
    res.json(
      registered.map((e) => ({
        nonce: e.nonce,
        sender: e.sender,
        embrRecipient: e.recipient,
        amount: e.amount,
        txHash: e.txHashSrc ?? "",
        blockNumber: 0,
        submittedAt: e.createdAt,
        source: "registered" as const,
      })),
    );
  } catch (err) {
    console.error("[bridge-scan] pending-base-outs failed:", (err as Error).message);
    res.json([]);
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
