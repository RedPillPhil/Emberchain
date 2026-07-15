import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateListingBody,
  CancelListingBody,
  BuyListingBody,
  ListExchangeListingsParams,
} from "@workspace/api-zod";
import { chain } from "../lib/chain";
import { verifyPayment } from "../lib/payment-verifier";

const router: IRouter = Router();

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
router.get("/exchange/listings/:id", async (req: Request, res: Response): Promise<void> => {
  const listing = await chain.getExchangeListing(req.params.id!);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.status(200).json(listing);
});

// POST /exchange/listings — create a listing (locks EMBR)
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
router.post("/exchange/listings/:id/cancel", async (req: Request, res: Response): Promise<void> => {
  const body = CancelListingBody.parse(req.body ?? {});
  try {
    const listing = await chain.cancelListing(req.params.id!, body.sellerAddress);
    res.status(200).json(listing);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to cancel listing" });
  }
});

// POST /exchange/listings/:id/buy — submit payment proof; verifies then releases EMBR
router.post("/exchange/listings/:id/buy", async (req: Request, res: Response): Promise<void> => {
  const body = BuyListingBody.parse(req.body ?? {});
  const id = req.params.id!;

  // Synchronously lock the listing before any async work — prevents double-claim
  let listing;
  try {
    listing = chain.lockListingForFulfillment(id);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Listing not available" });
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Fulfillment failed" });
  }
});

export default router;
