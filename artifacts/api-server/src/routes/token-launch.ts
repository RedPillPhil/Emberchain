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
import { deriveLaunchBridgeWallet, validateLaunchWalletParams, requiresManualEscrowSetup } from "../lib/launch-wallet";
import { processLaunchBridgeClaimGeneric } from "../lib/launch-bridge-relayer";
import { listHiddenAddresses, filterLaunchesByHidden } from "../lib/dex-markets";
import { getDepositsForLaunch } from "../lib/launch-deposit-db";
import {
  getLaunchFeeRecipientAddress,
  isAcceptedLaunchFeeRecipient,
} from "../lib/launch-fee-recipient";
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
    const feeRecipientAddress = getLaunchFeeRecipientAddress();
    res.json({
      usdAmount: TARGET_USD,
      ethPrice,
      ethAmount: ethAmountStr,
      weiAmount,
      feeRecipientAddress,
    });
  } catch (err) {
    logger.error({ err }, "[token-launch] /fee error");
    res.status(500).json({ error: "Failed to fetch fee" });
  }
});

// ── GET /token-launch/listings ────────────────────────────────────────────────

router.get("/token-launch/listings", async (_req, res) => {
  try {
    const hidden = await listHiddenAddresses();
    const listings = filterLaunchesByHidden(await getLiveLaunches(), hidden);
    res.json(listings.map((l) => sanitizeLaunch({
      ...l,
      native_bridge_address: l.native_bridge_address ?? l.bridge_wallet_address,
    })));
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
      submitter_address, wallet_download_url,
    } = req.body as Record<string, string>;

    // Validate required fields
    if (!symbol || !token_name || !chain_name || !chain_type || !rpc_url || !submitter_address) {
      return res.status(400).json({ error: "Missing required fields: symbol, token_name, chain_name, chain_type, rpc_url, submitter_address" });
    }

    const sym = symbol.toUpperCase().replace(/^w/i, "").trim();
    if (!/^[A-Z0-9]{1,10}$/.test(sym)) {
      return res.status(400).json({ error: "Symbol must be 1–10 alphanumeric characters" });
    }

    const normalizedChainType = chain_type.toLowerCase();
    let normalizedCrypto = cryptography || (normalizedChainType === "evm" ? "secp256k1" : cryptography);
    let normalizedFormat = address_format || (normalizedChainType === "evm" ? "hex" : address_format);
    if (normalizedChainType === "privacy") {
      normalizedCrypto = "ed25519";
      normalizedFormat = normalizedFormat || "base58";
    }
    if (normalizedChainType === "utxo" && !normalizedCrypto) {
      normalizedCrypto = "secp256k1";
    }

    const manualEscrow = requiresManualEscrowSetup({
      chainType: normalizedChainType,
      cryptography: normalizedCrypto,
      addressFormat: normalizedFormat,
    });

    if (manualEscrow && !wallet_download_url?.trim()) {
      return res.status(400).json({
        error: "Official wallet download link is required for privacy and custom chains (used by operators to create the bridge escrow address).",
      });
    }

    const validationError = validateLaunchWalletParams({
      launchId: "preview",
      chainType: normalizedChainType,
      cryptography: normalizedCrypto,
      addressFormat: normalizedFormat,
      utxoNetwork: utxo_network,
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const id = randomUUID();
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
      wallet_download_url: wallet_download_url?.trim() || undefined,
      escrow_mode: manualEscrow ? "manual" : "auto",
    });

    if (manualEscrow) {
      await updateLaunchStatus(launch.id, "pending_payment", {
        escrow_mode: "manual",
        wallet_download_url: wallet_download_url?.trim(),
        operator_message:
          "After payment, wTOKEN deploys on Base automatically. Bridge escrow is configured manually by the Emberchain team (usually within 24h).",
      });
      launch.escrow_mode = "manual";
      launch.wallet_download_url = wallet_download_url?.trim();
      logger.info({ id: launch.id, chainType: normalizedChainType }, "[token-launch] manual escrow launch — awaiting operator after deploy");
      return res.status(201).json(sanitizeLaunch(launch));
    }

    // Auto escrow: derive unique deposit address immediately.
    try {
      const bridgeWallet = deriveLaunchBridgeWallet({
        launchId: launch.id,
        chainType: normalizedChainType,
        cryptography: normalizedCrypto,
        addressFormat: normalizedFormat,
        utxoNetwork: utxo_network || "bitcoin",
      });
      await updateLaunchStatus(launch.id, "pending_payment", {
        bridge_wallet_address: bridgeWallet.address,
        bridge_wallet_type: bridgeWallet.type,
        bridge_private_key_encrypted: bridgeWallet.privateKeyEncrypted,
        native_bridge_address: bridgeWallet.address,
        escrow_mode: "auto",
      });
      launch.bridge_wallet_address = bridgeWallet.address;
      launch.bridge_wallet_type = bridgeWallet.type;
      launch.native_bridge_address = bridgeWallet.address;
      logger.info({ id: launch.id, address: bridgeWallet.address, type: bridgeWallet.type }, "[token-launch] escrow address assigned at submit");
    } catch (err) {
      logger.error({ err, id: launch.id }, "[token-launch] escrow derivation failed");
      await updateLaunchStatus(launch.id, "failed", {
        error_msg: err instanceof Error ? err.message : String(err),
      });
      return res.status(400).json({ error: err instanceof Error ? err.message : "Could not derive escrow address" });
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

    const feeRecipient = getLaunchFeeRecipientAddress();
    if (!feeRecipient) {
      return res.status(503).json({ error: "Launch fee recipient not configured (BRIDGE_RELAYER_PRIVATE_KEY)" });
    }

    if (receipt.to && !isAcceptedLaunchFeeRecipient(receipt.to)) {
      return res.status(422).json({
        error: "Transaction was not sent to the launch fee recipient",
        expectedRecipient: feeRecipient,
      });
    }

    const tx = await provider.getTransaction(tx_hash);
    if (!tx?.value) {
      return res.status(422).json({ error: "Transaction has no ETH value" });
    }

    const ethPrice = await getEthUsdPrice();
    const expectedWei = ethers.parseEther((TARGET_USD / ethPrice).toFixed(6));
    const minWei = (expectedWei * 95n) / 100n; // 5% tolerance for price drift
    if (tx.value < minWei) {
      return res.status(422).json({
        error: "Payment amount below launch fee",
        expectedEth: ethers.formatEther(expectedWei),
        receivedEth: ethers.formatEther(tx.value),
      });
    }

    const ethAmount = ethers.formatEther(tx.value);

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

// ── POST /token-launch/:id/claim-bridge ───────────────────────────────────────

router.post("/token-launch/:id/claim-bridge", async (req, res) => {
  try {
    const launch = await getLaunch(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });

    const { native_tx_hash, base_recipient } = req.body as {
      native_tx_hash?: string;
      base_recipient?: string;
    };
    if (!native_tx_hash || !base_recipient) {
      return res.status(400).json({ error: "native_tx_hash and base_recipient required" });
    }

    const result = await processLaunchBridgeClaimGeneric(
      launch,
      native_tx_hash.trim(),
      base_recipient.trim(),
    );

    res.json({
      ok: true,
      depositId: result.depositId,
      bridgeInTxHash: result.bridgeInTxHash,
      message: result.bridgeInTxHash
        ? "Wrapped tokens minted on Base."
        : "Deposit recorded.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, id: req.params.id }, "[token-launch] claim-bridge failed");
    res.status(422).json({ error: msg });
  }
});

// ── GET /token-launch/:id/deposits ────────────────────────────────────────────

router.get("/token-launch/:id/deposits", async (req, res) => {
  try {
    const launch = await getLaunch(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });
    const deposits = await getDepositsForLaunch(launch.id);
    res.json(deposits);
  } catch (err) {
    logger.error({ err }, "[token-launch] /deposits error");
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

export default router;
