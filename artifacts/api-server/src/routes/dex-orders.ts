/**
 * DEX orderbook REST endpoints.
 *
 * GET  /api/dex/orders        — list open orders (optionally ?token=0x...)
 * POST /api/dex/orders        — submit a new signed order
 * POST /api/dex/orders/:hash/fill    — mark an order filled; requires { txHash } proof from on-chain trade() call
 * POST /api/dex/orders/:hash/cancel  — mark an order cancelled; requires { signature } signed by the maker
 */

import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { insertOrder, listOrders, getOrder, updateOrderStatus, getOrdersETag, verifyTradeOnChain, type DexOrder } from "../lib/dex-orders-db";

const router = Router();

// GET /dex/orders
// Supports ETag / If-None-Match for polling clients — a matching ETag returns
// 304 Not Modified so clients skip JSON parsing and we skip serialisation.
router.get("/dex/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : "open";

    // Compute ETag from row-count + latest created_at (lightweight index scan).
    const etag = await getOrdersETag(token, status);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache"); // always revalidate; never serve stale

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    const orders = await listOrders(token, status);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /dex/orders
router.post("/dex/orders", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Partial<Omit<DexOrder, "status" | "created_at">>;
    const required = ["hash", "token_get", "amount_get", "token_give", "amount_give", "expires", "nonce", "maker", "v", "r", "s"];
    for (const field of required) {
      if (!body[field as keyof typeof body]) {
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

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// POST /dex/orders/:hash/fill
// Body: { txHash: string }  — the hash of the on-chain trade() transaction.
// The server verifies the tx receipt on Base: status=success AND a Trade event
// from the EmberDelta contract whose orderHash field matches the order in the URL.
router.post("/dex/orders/:hash/fill", async (req: Request<{ hash: string }>, res: Response): Promise<void> => {
  try {
    const { txHash } = req.body as { txHash?: string };
    if (!txHash || !TX_HASH_RE.test(txHash)) {
      res.status(400).json({ error: "txHash (32-byte hex string) is required to prove on-chain settlement" });
      return;
    }

    // On-chain proof: verify the tx receipt and Trade event before touching DB.
    const proofErr = await verifyTradeOnChain(txHash, req.params.hash);
    if (proofErr !== null) {
      res.status(422).json({ error: `On-chain verification failed: ${proofErr}` });
      return;
    }

    const result = await updateOrderStatus(req.params.hash, "filled");
    if (result === "not_found") { res.status(404).json({ error: "Order not found" }); return; }
    if (result === "conflict")  { res.status(409).json({ error: "Order is not open — already filled or cancelled" }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /dex/orders/:hash/cancel
// Body: { signature: string }  — EIP-191 personal_sign of the canonical cancel
// message, signed by the maker.  The server fetches the stored maker address
// and verifies the signature, so only the order creator can cancel their order.
// Cancel message: "EmberDelta cancel order: <orderHash>"
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
    if (result === "not_found") { res.status(404).json({ error: "Order not found" }); return; }
    if (result === "conflict")  { res.status(409).json({ error: "Order is not open — already filled or cancelled" }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
