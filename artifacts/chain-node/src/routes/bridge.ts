/**
 * Bridge register / status / history on chain-node (file-backed).
 * Wallet submits lock txs via POST /api/transactions, then registers here.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { ethers } from "ethers";
import { chain } from "../lib/chain";
import {
  createBridgeEvent,
  getBridgeEventByNonce,
  getBridgeHistoryForAddress,
  isBridgeRelayed,
  listRelayedKeys,
  upsertBridgeRelayed,
  type BridgeDirection,
} from "../lib/bridge-store";
import { fetchBaseBridgeOutByTxHash } from "../lib/base-bridge-scan";

const router: IRouter = Router();

const LOCK_EMBR_IFACE = new ethers.Interface([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);

const EMBER_BRIDGE_ADDRESS = (
  process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4"
).toLowerCase();

async function loadBridgeTransaction(hash: string) {
  const tx = await chain.getTransaction(hash);
  if (!tx) return undefined;
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    data: tx.data ?? "0x",
    blockNumber: tx.blockNumber,
    status: tx.status === "success" ? "confirmed" as const
      : tx.status === "failed" ? "failed" as const
      : "pending" as const,
    error: tx.error,
  };
}

router.post("/bridge/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      txHash?: string;
      baseRecipient?: string;
      amount?: string;
      nonce?: string | number;
    };
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
    const tx = await loadBridgeTransaction(txHash);
    if (!tx) {
      res.status(404).json({ error: "Transaction not found on EMBR chain" });
      return;
    }

    if (tx.status === "pending") {
      res.status(202).json({ message: "Transaction still pending — retry in a few seconds", txHash });
      return;
    }
    if (tx.status === "failed") {
      res.status(400).json({
        error: `Transaction failed on-chain: ${tx.error ?? "execution reverted"}`,
        txHash,
      });
      return;
    }

    if (EMBER_BRIDGE_ADDRESS && (!tx.to || tx.to.toLowerCase() !== EMBER_BRIDGE_ADDRESS)) {
      res.status(400).json({
        error: `Transaction target is not the EmberBridge contract (${EMBER_BRIDGE_ADDRESS})`,
      });
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
      res.status(400).json({
        error: `Calldata could not be decoded as lockEMBR: ${(err as Error).message}`,
      });
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

    const createResult = await createBridgeEvent({
      nonce: nonceStr,
      direction: "embr_to_base",
      sender: (tx.from ?? "").toLowerCase(),
      recipient: baseRecipient.toLowerCase(),
      amount: amountBig.toString(),
      txHashSrc: txHash,
    });

    if (createResult.kind === "conflict") {
      const existing = await getBridgeEventByNonce(nonceStr, "embr_to_base");
      res.status(200).json({
        message: "Bridge request already registered",
        nonce: nonceStr,
        status: existing?.status ?? "unknown",
      });
      return;
    }

    res.status(201).json({
      message: "Bridge request registered — wEMBR will appear on Base shortly",
      nonce: nonceStr,
      txHashSrc: txHash,
      status: "pending",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/bridge/register-base-out", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      txHash?: string;
      embrRecipient?: string;
      amount?: string;
      nonce?: string | number;
    };
    const { txHash, embrRecipient, amount, nonce } = body ?? {};

    if (!txHash) {
      res.status(400).json({ error: "txHash is required" });
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      res.status(400).json({ error: "txHash must be a valid 32-byte hex string (0x…64)" });
      return;
    }

    const parsed = await fetchBaseBridgeOutByTxHash(txHash);
    if (!parsed) {
      res.status(404).json({ error: "BridgeOut transaction not found or not confirmed on Base" });
      return;
    }

    const nonceStr = String(nonce ?? parsed.nonce);
    const recipient = (embrRecipient ?? parsed.embrRecipient).trim();
    const amountStr = amount ?? parsed.amount;

    if (nonceStr !== parsed.nonce) {
      res.status(400).json({ error: "nonce does not match the on-chain BridgeOut event" });
      return;
    }
    if (recipient.toLowerCase() !== parsed.embrRecipient.toLowerCase()) {
      res.status(400).json({ error: "embrRecipient does not match the on-chain BridgeOut event" });
      return;
    }
    if (BigInt(amountStr) !== BigInt(parsed.amount)) {
      res.status(400).json({ error: "amount does not match the on-chain BridgeOut event" });
      return;
    }

    const createResult = await createBridgeEvent({
      nonce: nonceStr,
      direction: "base_to_embr",
      sender: parsed.sender.toLowerCase(),
      recipient: recipient.toLowerCase(),
      amount: amountStr,
      txHashSrc: txHash,
    });

    if (createResult.kind === "conflict") {
      const existing = await getBridgeEventByNonce(nonceStr, "base_to_embr");
      res.status(200).json({
        message: "Base bridge already registered",
        nonce: nonceStr,
        status: existing?.status ?? "unknown",
      });
      return;
    }

    res.status(201).json({
      message: "Base→EMBR bridge registered — awaiting relayer release on Emberchain",
      nonce: nonceStr,
      txHashSrc: txHash,
      status: "pending",
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/bridge/relayed-keys", async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(listRelayedKeys());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/bridge/mark-relayed", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      direction?: BridgeDirection;
      nonce?: string;
      txHashSrc?: string;
      txHashDst?: string;
      sender?: string;
      recipient?: string;
      amount?: string;
    };
    const { direction, nonce, txHashSrc, txHashDst, sender, recipient, amount } = body ?? {};
    if (direction !== "embr_to_base" && direction !== "base_to_embr") {
      res.status(400).json({ error: "direction must be embr_to_base or base_to_embr" });
      return;
    }
    if (!nonce) {
      res.status(400).json({ error: "nonce is required" });
      return;
    }
    await upsertBridgeRelayed({
      direction,
      nonce: String(nonce),
      txHashSrc,
      txHashDst,
      sender,
      recipient,
      amount,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/bridge/status/:nonce", async (req: Request, res: Response): Promise<void> => {
  try {
    const { nonce } = req.params;
    const event = await getBridgeEventByNonce(nonce);
    if (!event) {
      res.status(404).json({ error: `No bridge event found for nonce ${nonce}` });
      return;
    }
    res.json({
      nonce: event.nonce,
      direction: event.direction,
      status: event.status,
      sender: event.sender,
      recipient: event.recipient,
      amount: event.amount,
      txHashSrc: event.txHashSrc,
      txHashDst: event.txHashDst,
      retryCount: event.retryCount,
      errorMsg: event.errorMsg,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/bridge/history/:address", async (req: Request, res: Response): Promise<void> => {
  try {
    const { address } = req.params;
    if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) {
      res.status(400).json({ error: "address must be a valid 0x Ethereum address" });
      return;
    }
    const events = await getBridgeHistoryForAddress(address);
    res.json(events.map((e) => ({
      nonce: e.nonce,
      direction: e.direction,
      status: e.status,
      sender: e.sender,
      recipient: e.recipient,
      amount: e.amount,
      txHashSrc: e.txHashSrc,
      txHashDst: e.txHashDst,
      createdAt: e.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
