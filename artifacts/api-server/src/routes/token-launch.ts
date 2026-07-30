/**
 * Token Launch Routes
 *
 * GET  /token-launch/fee            — current launch fee in ETH (≈ $20 USD)
 * GET  /token-launch/listings       — all live launched tokens
 * GET  /token-launch/my/:address    — launches by submitter address
 * POST /token-launch/submit         — create a new launch request
 * GET  /token-launch/:id            — get launch status/details
 * POST /token-launch/:id/verify-payment — verify fee tx on Base and advance status
 */

import { Router } from "express";
import { ethers } from "ethers";
import { randomUUID } from "crypto";
import {
  createLaunch,
  getLaunch,
  getLiveLaunches,
  getLaunchesBySubmitter,
  updateLaunchStatus,
  type TokenLaunch,
} from "../lib/launch-db";
import { getBaseProvider } from "../lib/base-provider";
import { getStaticBridgeAddress } from "../lib/chain-adapters/index";
import { logger } from "../lib/logger";

/**
 * Strip sensitive server-side fields before sending launch data to clients.
 * bridge_private_key_encrypted must NEVER be exposed in API responses.
 */
function sanitizeLaunch(launch: TokenLaunch): Omit<TokenLaunch, "bridge_private_key_encrypted"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bridge_private_key_encrypted: _secret, ...safe } = launch;
  return safe;
}

const router = Router();

// ── ETH/USD price cache ───────────────────────────────────────────────────────

let _cachedEthPrice: number | null = null;
let _priceTs = 0;
const PRICE_TTL_MS = 60_000;

async function getEthUsdPrice(): Promise<number> {
  if (_cachedEthPrice !== null && Date.now() - _priceTs < PRICE_TTL_MS) {
    return _cachedEthPrice;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5_000) },
    );
    const json = (await res.json()) as { ethereum?: { usd?: number } };
    const price = json?.ethereum?.usd;
    if (price && price > 0) {
      _cachedEthPrice = price;
      _priceTs = Date.now();
      return price;
    }
  } catch (err) {
    logger.warn({ err }, "[token-launch] ETH price fetch failed — using cached/fallback");
  }
  return _cachedEthPrice ?? 3_000; // safe fallback
}

const TARGET_USD = 20; // $20 launch fee

// ── GET /token-launch/fee ─────────────────────────────────────────────────────

router.get("/token-launch/fee", async (_req, res) => {
  try {
    const ethPrice = await getEthUsdPrice();
    const ethAmount = TARGET_USD / ethPrice;
    const ethAmountStr = ethAmount.toFixed(6);
    const weiAmount = ethers.parseEther(ethAmountStr).toString();
    res.json({
      usdAmount: TARGET_USD,
      ethPrice,
      ethAmount: ethAmountStr,
      weiAmount,
    });
  } catch (err) {
    logger.error({ err }, "[token-launch] /fee error");
    res.status(500).json({ error: "Failed to fetch fee" });
  }
});

// ── GET /token-launch/listings ────────────────────────────────────────────────

router.get("/token-launch/listings", async (_req, res) => {
  try {
    const listings = await getLiveLaunches();
    res.json(listings.map(sanitizeLaunch));
  } catch (err) {
    logger.error({ err }, "[token-launch] /listings error");
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// ── GET /token-launch/my/:address ─────────────────────────────────────────────

router.get("/token-launch/my/:address", async (req, res) => {
  try {
    const launches = await getLaunchesBySubmitter(req.params.address);
    res.json(launches.map(sanitizeLaunch));
  } catch (err) {
    logger.error({ err }, "[token-launch] /my/:address error");
    res.status(500).json({ error: "Failed to fetch launches" });
  }
});

// ── POST /token-launch/submit ─────────────────────────────────────────────────

router.post("/token-launch/submit", async (req, res) => {
  try {
    const {
      symbol, token_name, chain_name, chain_type,
      chain_id, rpc_url, explorer_url,
      consensus, cryptography, address_format, utxo_network, tx_model,
      decimals, confirmations_req,
      submitter_address,
    } = req.body as Record<string, string>;

    // Validate required fields
    if (!symbol || !token_name || !chain_name || !chain_type || !rpc_url || !submitter_address) {
      return res.status(400).json({ error: "Missing required fields: symbol, token_name, chain_name, chain_type, rpc_url, submitter_address" });
    }

    const sym = symbol.toUpperCase().replace(/^w/i, "").trim();
    if (!/^[A-Z0-9]{1,10}$/.test(sym)) {
      return res.status(400).json({ error: "Symbol must be 1–10 alphanumeric characters" });
    }

    const id = randomUUID();
    const normalizedChainType = chain_type.toLowerCase();
    const launch = await createLaunch({
      id,
      symbol: sym,
      wrapped_symbol: `w${sym}`,
      token_name: token_name.trim(),
      decimals: parseInt(decimals ?? "18", 10) || 18,
      chain_type: normalizedChainType,
      chain_name: chain_name.trim(),
      chain_id: chain_id || undefined,
      rpc_url: rpc_url.trim(),
      explorer_url: explorer_url?.trim() || undefined,
      consensus: consensus || undefined,
      cryptography: cryptography || undefined,
      address_format: address_format || undefined,
      utxo_network: utxo_network || undefined,
      tx_model: tx_model || undefined,
      confirmations_req: parseInt(confirmations_req ?? "6", 10) || 6,
      submitter_address: submitter_address.toLowerCase(),
    });

    // For non-EVM chains the deposit address is deterministic — populate it
    // immediately so the Bridge page can show it without waiting for payment.
    if (normalizedChainType !== "evm") {
      try {
        const bridgeWallet = getStaticBridgeAddress(
          normalizedChainType,
          cryptography || "secp256k1",
          address_format || "hex",
          utxo_network || "bitcoin",
        );
        await updateLaunchStatus(launch.id, "pending_payment", {
          bridge_wallet_address: bridgeWallet.address,
          bridge_wallet_type: bridgeWallet.type,
          native_bridge_address: bridgeWallet.address,
        });
        launch.bridge_wallet_address = bridgeWallet.address;
        launch.bridge_wallet_type = bridgeWallet.type;
        launch.native_bridge_address = bridgeWallet.address;
        logger.info({ id: launch.id, address: bridgeWallet.address }, "[token-launch] deposit address pre-assigned at submission");
      } catch (err) {
        logger.warn({ err, id: launch.id }, "[token-launch] could not pre-assign deposit address (will retry at payment confirmation)");
      }
    }

    res.status(201).json(sanitizeLaunch(launch));
  } catch (err) {
    logger.error({ err }, "[token-launch] /submit error");
    res.status(500).json({ error: "Failed to create launch" });
  }
});

// ── GET /token-launch/:id ─────────────────────────────────────────────────────

router.get("/token-launch/:id", async (req, res) => {
  try {
    const launch = await getLaunch(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });
    res.json(sanitizeLaunch(launch));
  } catch (err) {
    logger.error({ err }, "[token-launch] /:id GET error");
    res.status(500).json({ error: "Failed to fetch launch" });
  }
});

// ── POST /token-launch/:id/verify-payment ─────────────────────────────────────

const TOKEN_LAUNCH_FEE_ADDRESS = (process.env["TOKEN_LAUNCH_FEE_ADDRESS"] ?? "").toLowerCase();

router.post("/token-launch/:id/verify-payment", async (req, res) => {
  try {
    const launch = await getLaunch(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });
    if (launch.status !== "pending_payment") {
      return res.json({ status: launch.status, message: "Payment already verified" });
    }

    const { tx_hash } = req.body as { tx_hash?: string };
    if (!tx_hash) return res.status(400).json({ error: "tx_hash required" });

    const provider = getBaseProvider();
    if (!provider) {
      // dev mode: skip verification
      if (process.env["NODE_ENV"] === "development") {
        await updateLaunchStatus(launch.id, "payment_confirmed", {
          fee_tx_hash: tx_hash,
          fee_payer: launch.submitter_address,
          fee_amount_eth: "dev",
        });
        return res.json({ status: "payment_confirmed" });
      }
      return res.status(503).json({ error: "BASE_RPC_URL not configured" });
    }

    // Fetch receipt on Base
    const receipt = await provider.getTransactionReceipt(tx_hash);
    if (!receipt) return res.status(422).json({ error: "Transaction not found on Base" });
    if (receipt.status !== 1) return res.status(422).json({ error: "Transaction failed on-chain" });

    // Verify destination is the fee contract (if address is configured)
    if (TOKEN_LAUNCH_FEE_ADDRESS && receipt.to) {
      if (receipt.to.toLowerCase() !== TOKEN_LAUNCH_FEE_ADDRESS) {
        return res.status(422).json({ error: "Transaction was not sent to the launch fee contract" });
      }
    }

    const tx = await provider.getTransaction(tx_hash);
    const ethAmount = tx?.value ? ethers.formatEther(tx.value) : "unknown";

    await updateLaunchStatus(launch.id, "payment_confirmed", {
      fee_tx_hash: tx_hash,
      fee_payer: receipt.from.toLowerCase(),
      fee_amount_eth: ethAmount,
    });

    res.json({ status: "payment_confirmed", ethAmount });
  } catch (err) {
    logger.error({ err }, "[token-launch] /verify-payment error");
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
