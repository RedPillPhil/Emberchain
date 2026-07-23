/**
 * Bridge API routes — same contract but uses chain-client to talk to
 * chain-node instead of importing chain directly.
 */

import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { createTxFromRLP } from "@ethereumjs/tx";
import { bytesToHex, hexToBytes } from "@ethereumjs/util";
import type { PrefixedHexString } from "@ethereumjs/util";
import { createEmberchainCommon } from "@workspace/chain-core";
import * as chainClient from "@workspace/chain-client";
import {
  createBridgeEvent,
  getBridgeEventByNonce,
  getBridgeHistoryForAddress,
} from "../lib/bridge-db";
import { logger } from "../lib/logger";

const common = createEmberchainCommon();

const LOCK_EMBR_IFACE = new ethers.Interface([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForTxConfirmed(hash: string, timeoutMs = 90_000, pollMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await chainClient.getTransaction(hash) as { status: string; error?: string } | null;
    if (tx && tx.status !== "pending") return tx;
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Transaction ${hash} was not included in a block within ${timeoutMs / 1000}s`);
}

const router = Router();

// ---------------------------------------------------------------------------
// POST /bridge/lock — initiate EMBR → Base
// ---------------------------------------------------------------------------

router.post("/bridge/lock", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    rawTx?: string;
    baseRecipient?: string;
    amount?: string;
    nonce?: string | number;
  };

  const { rawTx, baseRecipient, amount, nonce } = body ?? {};

  if (!rawTx || !baseRecipient || !amount || nonce === undefined) {
    res.status(400).json({ error: "rawTx, baseRecipient, amount, and nonce are required" });
    return;
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) {
    res.status(400).json({ error: "baseRecipient must be a valid 0x Ethereum address" });
    return;
  }

  let amountBig: bigint;
  try {
    amountBig = BigInt(amount);
    if (amountBig <= 0n) throw new Error("non-positive");
  } catch {
    res.status(400).json({ error: "amount must be a positive integer (wei)" });
    return;
  }

  const nonceStr = String(nonce);

  let parsed: ReturnType<typeof createTxFromRLP>;
  try {
    parsed = createTxFromRLP(hexToBytes(rawTx as PrefixedHexString), { common });
  } catch (err) {
    res.status(400).json({ error: `Could not parse raw transaction: ${(err as Error).message}` });
    return;
  }

  if (!parsed.verifySignature()) {
    res.status(400).json({ error: "Invalid transaction signature" });
    return;
  }

  const from     = parsed.getSenderAddress().toString() as PrefixedHexString;
  const txHash   = bytesToHex(parsed.hash());
  const txTo     = parsed.to?.toString().toLowerCase() ?? null;
  const txValue  = parsed.value;
  const txData   = bytesToHex(parsed.data) as PrefixedHexString;
  const gasLimit = parsed.gasLimit.toString();
  const txNonce  = parsed.nonce;

  const emberBridgeAddress = (process.env["EMBER_BRIDGE_ADDRESS"] ?? "").toLowerCase();
  if (emberBridgeAddress) {
    if (!txTo || txTo !== emberBridgeAddress) {
      res.status(400).json({
        error: `Transaction must target the EmberBridge contract (${emberBridgeAddress}), got: ${txTo ?? "null"}`,
      });
      return;
    }
  } else if (!txTo) {
    res.status(400).json({ error: "Transaction has no destination address" });
    return;
  }

  let decodedRecipient: string;
  let decodedNonce: bigint;
  try {
    const decoded = LOCK_EMBR_IFACE.parseTransaction({ data: txData, value: txValue });
    if (!decoded || decoded.name !== "lockEMBR") {
      throw new Error("function selector does not match lockEMBR(address,uint256)");
    }
    decodedRecipient = (decoded.args[0] as string).toLowerCase();
    decodedNonce = decoded.args[1] as bigint;
  } catch (err) {
    res.status(400).json({ error: `Calldata could not be decoded as lockEMBR: ${(err as Error).message}` });
    return;
  }

  if (decodedRecipient !== baseRecipient.toLowerCase()) {
    res.status(400).json({ error: "baseRecipient in calldata does not match provided baseRecipient" });
    return;
  }

  if (decodedNonce.toString() !== nonceStr) {
    res.status(400).json({ error: "nonce in calldata does not match provided nonce" });
    return;
  }

  if (txValue !== amountBig) {
    res.status(400).json({ error: `Transaction value (${txValue}) does not match provided amount (${amountBig})` });
    return;
  }

  try {
    await chainClient.submitRawEVMTransaction({
      hash: txHash, from, to: txTo ?? null,
      value: txValue.toString(), data: txData, gasLimit, nonce: txNonce,
    });
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn({ err: msg }, "[bridge] lockEMBR raw tx rejected by chain-node");
    res.status(400).json({ error: `EMBR chain rejected the transaction: ${msg}` });
    return;
  }

  let confirmedTx: { status: string; error?: string };
  try {
    confirmedTx = await waitForTxConfirmed(txHash);
  } catch {
    res.status(202).json({
      message: "Transaction submitted but confirmation timed out. Check /api/bridge/status/:nonce after a few seconds.",
      txHash,
    });
    return;
  }

  if (confirmedTx.status !== "success") {
    res.status(400).json({
      error: `lockEMBR transaction reverted on-chain: ${confirmedTx.error ?? "execution failed"}`,
      txHash,
    });
    return;
  }

  let createResult: Awaited<ReturnType<typeof createBridgeEvent>>;
  try {
    createResult = await createBridgeEvent({
      nonce: nonceStr, direction: "embr_to_base",
      sender: from.toLowerCase(), recipient: baseRecipient.toLowerCase(),
      amount: amountBig.toString(), txHashSrc: txHash,
    });
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ nonce: nonceStr, txHash, err: msg }, "[bridge] DB write failed after confirmed lock");
    res.status(503).json({
      error: "Bridge transfer confirmed on-chain but could not be persisted — please retry this request",
      txHash,
    });
    return;
  }

  if (createResult.kind === "conflict") {
    const existing = await getBridgeEventByNonce(nonceStr);
    res.status(200).json({ message: "Bridge request already recorded", nonce: nonceStr, status: existing?.status ?? "unknown" });
    return;
  }

  logger.info({ nonce: nonceStr, txHash, baseRecipient }, "[bridge] EMBR→Base lock confirmed on-chain and recorded");
  res.status(201).json({
    message: "Bridge request accepted — wEMBR will appear in your Base wallet shortly",
    nonce: nonceStr, txHashSrc: txHash, status: "pending",
  });
});

// ---------------------------------------------------------------------------
// POST /bridge/register — register bridge intent from a wallet-submitted tx
// ---------------------------------------------------------------------------

router.post("/bridge/register", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { txHash?: string; baseRecipient?: string; amount?: string; nonce?: string | number };
  const { txHash, baseRecipient, amount, nonce } = body ?? {};

  if (!txHash || !baseRecipient || !amount || nonce === undefined) {
    res.status(400).json({ error: "txHash, baseRecipient, amount, and nonce are required" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ error: "txHash must be a valid 32-byte hex string (0x…64)" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(baseRecipient)) {
    res.status(400).json({ error: "baseRecipient must be a valid 0x Ethereum address" });
    return;
  }

  let amountBig: bigint;
  try {
    amountBig = BigInt(amount);
    if (amountBig <= 0n) throw new Error("non-positive");
  } catch {
    res.status(400).json({ error: "amount must be a positive integer (wei)" });
    return;
  }

  const nonceStr = String(nonce);

  const tx = await chainClient.getTransaction(txHash);
  if (!tx) { res.status(404).json({ error: "Transaction not found on EMBR chain" }); return; }

  if (tx.status === "pending") {
    res.status(202).json({ message: "Transaction still pending — retry in a few seconds", txHash });
    return;
  }
  if (tx.status === "failed") {
    res.status(400).json({ error: `Transaction failed on-chain: ${tx.error ?? "execution reverted"}`, txHash });
    return;
  }

  const emberBridgeAddress = (process.env["EMBER_BRIDGE_ADDRESS"] ?? "").toLowerCase();
  if (emberBridgeAddress && (!tx.to || tx.to.toLowerCase() !== emberBridgeAddress)) {
    res.status(400).json({ error: `Transaction target is not the EmberBridge contract (${emberBridgeAddress})` });
    return;
  }

  let decodedRecipient: string;
  let decodedNonce: bigint;
  try {
    const decoded = LOCK_EMBR_IFACE.parseTransaction({ data: tx.data, value: BigInt(tx.value) });
    if (!decoded || decoded.name !== "lockEMBR") throw new Error("Not a lockEMBR call");
    decodedRecipient = (decoded.args[0] as string).toLowerCase();
    decodedNonce = decoded.args[1] as bigint;
  } catch (err) {
    res.status(400).json({ error: `Calldata could not be decoded as lockEMBR: ${(err as Error).message}` });
    return;
  }

  if (decodedRecipient !== baseRecipient.toLowerCase()) {
    res.status(400).json({ error: "baseRecipient in calldata does not match" });
    return;
  }
  if (decodedNonce.toString() !== nonceStr) {
    res.status(400).json({ error: "nonce in calldata does not match" });
    return;
  }
  if (BigInt(tx.value) !== amountBig) {
    res.status(400).json({ error: "Transaction value does not match claimed amount" });
    return;
  }

  let createResult: Awaited<ReturnType<typeof createBridgeEvent>>;
  try {
    createResult = await createBridgeEvent({
      nonce: nonceStr, direction: "embr_to_base",
      sender: (tx.from ?? "").toLowerCase(), recipient: baseRecipient.toLowerCase(),
      amount: amountBig.toString(), txHashSrc: txHash,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[bridge] DB write failed in /register");
    res.status(503).json({ error: "Could not persist bridge event — please retry" });
    return;
  }

  if (createResult.kind === "conflict") {
    const existing = await getBridgeEventByNonce(nonceStr);
    res.status(200).json({ message: "Bridge request already registered", nonce: nonceStr, status: existing?.status ?? "unknown" });
    return;
  }

  logger.info({ nonce: nonceStr, txHash }, "[bridge] EMBR→Base registered via wallet tx");
  res.status(201).json({ message: "Bridge request registered — wEMBR will appear on Base shortly", nonce: nonceStr, txHashSrc: txHash, status: "pending" });
});

// ---------------------------------------------------------------------------
// GET /bridge/status/:nonce
// ---------------------------------------------------------------------------

router.get("/bridge/status/:nonce", async (req: Request, res: Response): Promise<void> => {
  const { nonce } = req.params as { nonce: string };
  const event = await getBridgeEventByNonce(nonce);
  if (!event) { res.status(404).json({ error: `No bridge event found for nonce ${nonce}` }); return; }
  res.json({
    nonce: event.nonce, direction: event.direction, status: event.status,
    sender: event.sender, recipient: event.recipient, amount: event.amount,
    txHashSrc: event.txHashSrc, txHashDst: event.txHashDst,
    retryCount: event.retryCount, errorMsg: event.errorMsg,
    createdAt: event.createdAt, updatedAt: event.updatedAt,
  });
});

// ---------------------------------------------------------------------------
// GET /bridge/history/:address
// ---------------------------------------------------------------------------

router.get("/bridge/history/:address", async (req: Request, res: Response): Promise<void> => {
  const { address } = req.params as { address: string };
  if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) {
    res.status(400).json({ error: "address must be a valid 0x Ethereum address" });
    return;
  }
  const events = await getBridgeHistoryForAddress(address);
  res.json(events.map((e) => ({
    nonce: e.nonce, direction: e.direction, status: e.status,
    sender: e.sender, recipient: e.recipient, amount: e.amount,
    txHashSrc: e.txHashSrc, txHashDst: e.txHashDst,
    retryCount: e.retryCount, errorMsg: e.errorMsg,
    createdAt: e.createdAt, updatedAt: e.updatedAt,
  })));
});

export default router;
