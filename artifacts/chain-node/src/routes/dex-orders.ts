/**
 * DEX orderbook REST — file-backed on chain-node (same API as api-server).
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { ethers } from "ethers";
import {
  getOrder,
  getOrdersETag,
  insertOrder,
  isOrderFullyFilledOnChain,
  listOrders,
  updateOrderStatus,
  verifyTradeOnChain,
  type DexOrder,
} from "../lib/dex-orders-store";
import { parseTradesFromTxHash, invalidateTradeScanCache } from "../lib/dex-trade-scan";
import { upsertRecordedTrades } from "../lib/dex-fills-store";
import {
  bumpDexTradesRefresh,
  getDexTradesCached,
  startDexTradesPoller,
} from "../lib/dex-trades-cache";

const router: IRouter = Router();
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Warm the trades snapshot as soon as this module loads (server boot).
startDexTradesPoller();

router.get("/dex/trades", async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.query.refresh === "1") {
      invalidateTradeScanCache();
      bumpDexTradesRefresh();
    }
    const lookbackRaw = Number(req.query.lookback ?? 0);
    // lookback=0 → full history from deploy block; otherwise clamp 1k–500k blocks
    const lookback = lookbackRaw === 0
      ? 0
      : Number.isFinite(lookbackRaw)
        ? Math.min(Math.max(lookbackRaw, 1_000), 500_000)
        : 0;
    const snap = getDexTradesCached(lookback);
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json({
      headBlock: snap.headBlock,
      logs: snap.logs,
      updatedAt: snap.updatedAt,
      stale: snap.stale,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/dex/trades/ingest", async (req: Request, res: Response): Promise<void> => {
  try {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash || !TX_HASH_RE.test(txHash)) {
      res.status(400).json({ error: "txHash (32-byte hex) is required" });
      return;
    }
    const trades = await parseTradesFromTxHash(txHash);
    if (trades.length === 0) {
      res.status(404).json({ error: "No Trade events in that Base transaction" });
      return;
    }
    upsertRecordedTrades(trades);
    invalidateTradeScanCache();
    bumpDexTradesRefresh();
    res.json({ ok: true, count: trades.length, trades });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/dex/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : "open";

    const etag = await getOrdersETag(token, status);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache");

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    res.json(await listOrders(token, status));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/dex/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Partial<Omit<DexOrder, "status" | "created_at">>;
    const required = [
      "hash", "token_get", "amount_get", "token_give", "amount_give",
      "expires", "nonce", "maker", "v", "r", "s",
    ];
    for (const field of required) {
      if (body[field as keyof typeof body] === undefined || body[field as keyof typeof body] === null) {
        res.status(400).json({ error: `Missing field: ${field}` });
        return;
      }
    }
    await insertOrder(body as Omit<DexOrder, "status" | "created_at">);
    res.status(201).json({ ok: true, hash: body.hash });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/dex/orders/:hash/fill", async (req: Request<{ hash: string }>, res: Response): Promise<void> => {
  try {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash || !TX_HASH_RE.test(txHash)) {
      res.status(400).json({ error: "txHash (32-byte hex string) is required to prove on-chain settlement" });
      return;
    }

    const proofErr = await verifyTradeOnChain(txHash, req.params.hash);
    if (proofErr !== null) {
      res.status(422).json({ error: `On-chain verification failed: ${proofErr}` });
      return;
    }

    const trades = await parseTradesFromTxHash(txHash);
    upsertRecordedTrades(trades);
    invalidateTradeScanCache();
    bumpDexTradesRefresh();

    const order = await getOrder(req.params.hash);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const fullyFilled = await isOrderFullyFilledOnChain(order);
    if (fullyFilled === false) {
      res.json({ ok: true, partial: true });
      return;
    }

    if (fullyFilled === null && process.env.NODE_ENV !== "development") {
      res.json({ ok: true, partial: true, note: "Could not verify remaining volume — order kept open" });
      return;
    }

    const result = await updateOrderStatus(req.params.hash, "filled");
    if (result === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result === "conflict") {
      res.status(409).json({ error: "Order is not open — already filled or cancelled" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/dex/orders/:hash/cancel", async (req: Request<{ hash: string }>, res: Response): Promise<void> => {
  try {
    const { signature } = req.body as { signature?: string };
    if (!signature) {
      res.status(400).json({ error: "signature is required — sign the cancel message with the maker wallet" });
      return;
    }

    const order = await getOrder(req.params.hash);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const cancelMessage = `EmberDelta cancel order: ${req.params.hash}`;
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(cancelMessage, signature).toLowerCase();
    } catch {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (recovered !== order.maker.toLowerCase()) {
      res.status(403).json({ error: "Signature does not match the order maker" });
      return;
    }

    const result = await updateOrderStatus(req.params.hash, "cancelled");
    if (result === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result === "conflict") {
      res.status(409).json({ error: "Order is not open — already filled or cancelled" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
