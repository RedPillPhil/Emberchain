import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateListingBody,
  CancelListingBody,
  BuyListingBody,
  ListExchangeListingsParams,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { verifyPayment } from "../lib/payment-verifier";
import { getProofByTxHash } from "../lib/db";

const router: IRouter = Router();

type IdParams = { id: string };

// GET /exchange/listings
router.get("/exchange/listings", async (req: Request, res: Response): Promise<void> => {
  const query = ListExchangeListingsParams.parse(req.query);
  const listings = await chain.listExchangeListings(query.status);
  const filtered = query.seller
    ? listings.filter((l) => l.sellerAddress.toLowerCase() === query.seller!.toLowerCase())
    : listings;
  res.status(200).json(filtered);
});

// GET /exchange/listings/:id
router.get("/exchange/listings/:id", async (req: Request<IdParams>, res: Response): Promise<void> => {
  const listing = await chain.getExchangeListing(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.status(200).json(listing);
});

// POST /exchange/listings — create a listing (locks EMBR immediately, auth via private key)
router.post("/exchange/listings", async (req: Request, res: Response): Promise<void> => {
  const body = CreateListingBody.parse(req.body ?? {});
  try {
    const listing = await chain.createListing(body);
    res.status(201).json(listing);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create listing" });
  }
});

// POST /exchange/listings/:id/cancel — seller cancels, EMBR unlocked
router.post("/exchange/listings/:id/cancel", async (req: Request<IdParams>, res: Response): Promise<void> => {
  const body = CancelListingBody.parse(req.body ?? {});
  try {
    const listing = await chain.cancelListing(req.params.id, body.sellerPrivateKey);
    res.status(200).json(listing);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to cancel listing" });
  }
});

// POST /exchange/listings/:id/buy — submit payment proof; verifies then releases EMBR
router.post("/exchange/listings/:id/buy", async (req: Request<IdParams>, res: Response): Promise<void> => {
  const body = BuyListingBody.parse(req.body ?? {});
  const id = req.params.id;

  // Synchronously lock the listing AND reserve the proof key before any async work.
  // All checks+reservations happen in one event-loop tick, so this is atomic in
  // Node.js's single-threaded model — no two requests can race past the gate for
  // the same listing OR the same external tx hash across different listings.
  let listing;
  try {
    listing = chain.lockListingForFulfillment(id, body.paymentTxHash);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Listing not available";
    // "already used" indicates a duplicate payment proof — look up the original
    // listing so we can surface a specific, actionable error to the buyer.
    if (msg.includes("already used")) {
      const existing = await getProofByTxHash(body.paymentTxHash);
      res.status(409).json({
        error: existing
          ? `This ${existing.currency} transaction has already been used to fulfill listing ${existing.listingId}. Each payment transaction can only be used once.`
          : "This transaction has already been used to fulfill a previous listing. Each payment transaction can only be used once.",
        code: "DUPLICATE_PROOF",
        originalListingId: existing?.listingId ?? null,
        currency: existing?.currency ?? null,
      });
    } else {
      res.status(409).json({ error: msg });
    }
    return;
  }

  try {
    const result = await verifyPayment(
      listing.currency,
      body.paymentTxHash,
      listing.receiveAddress,
      listing.priceAmount,
    );

    if (!result.valid) {
      chain.unlockListing(id);
      res.status(400).json({
        error: result.reason ?? "Payment verification failed",
        code: "PAYMENT_VERIFICATION_FAILED",
        confirmations: result.confirmations,
      });
      return;
    }

    const fulfilled = await chain.commitFulfillment(id, body.buyerAddress, body.paymentTxHash);
    res.status(200).json(fulfilled);
  } catch (err) {
    chain.unlockListing(id);
    const msg = err instanceof Error ? err.message : "Fulfillment failed";
    const status = msg.startsWith("Payment proof already used") ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

export default router;
