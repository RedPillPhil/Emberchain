/**
 * Internal API — used exclusively by the api-server service via chain-client.
 * Exposes chain methods for exchange, privacy, contracts, and bridge operations
 * that are too complex for simple HTTP proxying.
 *
 * These routes are NOT intended for external callers.
 */

import { Router, type Request, type Response } from "express";
import { chain } from "../lib/chain";

const router = Router();

// ── Exchange ───────────────────────────────────────────────────────────────────

router.get("/internal/exchange/listings", async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const listings = await chain.listExchangeListings(status);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.get("/internal/exchange/listings/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const listing = await chain.getExchangeListing(String(req.params["id"]));
    if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
    res.json(listing);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

router.post("/internal/exchange/listings", async (req: Request, res: Response): Promise<void> => {
  try {
    const listing = await chain.createListing(req.body);
    res.status(201).json(listing);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create listing" });
  }
});

router.post("/internal/exchange/listings/:id/cancel", async (req: Request, res: Response): Promise<void> => {
  try {
    const listing = await chain.cancelListing(String(req.params["id"]), req.body.sellerPrivateKey);
    res.json(listing);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to cancel" });
  }
});

router.post("/internal/exchange/listings/:id/reserve", (req: Request, res: Response): void => {
  try {
    const listing = chain.reserveListing(String(req.params["id"]), req.body.buyerAddress);
    res.json(listing);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not reserve listing";
    res.status(msg.includes("reserved by another buyer") ? 409 : 400).json({ error: msg });
  }
});

router.post("/internal/exchange/listings/:id/lock", (req: Request, res: Response): void => {
  try {
    const listing = chain.lockListingForFulfillment(String(req.params["id"]), req.body.paymentTxHash, req.body.buyerAddress);
    res.json(listing);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Listing not available";
    const status = msg.includes("already used") ? 409 : msg.includes("reserved by another") ? 409 : 400;
    res.status(status).json({ error: msg, code: msg.includes("already used") ? "DUPLICATE_PROOF" : "LISTING_RESERVED" });
  }
});

router.post("/internal/exchange/listings/:id/unlock", (req: Request, res: Response): void => {
  try {
    chain.unlockListing(String(req.params["id"]));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to unlock" });
  }
});

router.post("/internal/exchange/listings/:id/commit", async (req: Request, res: Response): Promise<void> => {
  try {
    const { buyerAddress, paymentTxHash, selectedNetwork } = req.body as {
      buyerAddress: string; paymentTxHash: string; selectedNetwork?: string;
    };
    const fulfilled = await chain.commitFulfillment(String(req.params["id"]), buyerAddress, paymentTxHash, selectedNetwork);
    res.json(fulfilled);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fulfillment failed";
    res.status(msg.startsWith("Payment proof already used") ? 409 : 500).json({ error: msg });
  }
});

// ── Privacy ────────────────────────────────────────────────────────────────────

router.get("/internal/privacy/status", async (_req: Request, res: Response): Promise<void> => {
  try { res.json(await chain.getPrivacyStatus()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.get("/internal/privacy/meta/:address", async (req: Request, res: Response): Promise<void> => {
  try {
    const meta = await chain.getStealthMeta(String(req.params["address"]));
    if (!meta) { res.status(404).json({ error: "No stealth meta-address found" }); return; }
    res.json(meta);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/internal/privacy/balance", async (req: Request, res: Response): Promise<void> => {
  try { res.json(await chain.getPrivateBalance(req.body.privateKey)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/internal/privacy/shield", async (req: Request, res: Response): Promise<void> => {
  try { res.status(201).json(await chain.shield(req.body)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Shield failed" }); }
});

router.post("/internal/privacy/send", async (req: Request, res: Response): Promise<void> => {
  try { res.status(201).json(await chain.privateSend(req.body)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Private send failed" }); }
});

router.post("/internal/privacy/unshield", async (req: Request, res: Response): Promise<void> => {
  try { res.status(201).json(await chain.unshield(req.body)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Unshield failed" }); }
});

router.get("/internal/privacy/ledger", async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 20;
    res.json(await chain.listPrivacyLedger(limit));
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ── Contract / Chain helpers ───────────────────────────────────────────────────

router.post("/internal/call-contract", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await chain.callContract(req.body as { to: string; data: string; from?: string | null });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Call failed" }); }
});

router.get("/internal/contract-code/:address", async (req: Request, res: Response): Promise<void> => {
  try { res.json({ code: await chain.getContractCode(String(req.params["address"])) }); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/internal/submit-transaction", async (req: Request, res: Response): Promise<void> => {
  try {
    const tx = await chain.submitTransaction(req.body);
    res.status(201).json(tx);
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/internal/submit-raw-evm-tx", async (req: Request, res: Response): Promise<void> => {
  try {
    await chain.submitRawEVMTransaction(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// Resolve the block that contains a given transaction hash.
// Blockchain has no getBlockForTx — derive it from getTransaction + getBlock.
router.get("/internal/block-for-tx/:hash", async (req: Request, res: Response): Promise<void> => {
  try {
    const tx = await chain.getTransaction(String(req.params["hash"]));
    if (!tx || tx.blockNumber == null) { res.json(null); return; }
    const block = await chain.getBlock(tx.blockNumber);
    res.json(block ?? null);
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
