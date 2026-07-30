/**
 * Ethereum JSON-RPC 2.0 — makes the standalone daemon visible to MetaMask
 * and any EVM-compatible wallet or tooling.
 * Identical to chain-node/src/routes/rpc.ts — only import paths differ.
 */

import { Router } from "express";
import { createTxFromRLP } from "@ethereumjs/tx";
import { bytesToHex, hexToBytes } from "@ethereumjs/util";
import type { PrefixedHexString } from "@ethereumjs/util";
import { EMBERCHAIN_ID, createEmberchainCommon, GAS_PRICE } from "@workspace/chain-core";
import type { StoredBlock, StoredTransaction } from "@workspace/chain-core";
import { chain } from "../lib/chain.js";

const router = Router();
const CHAIN_ID_HEX  = "0x" + EMBERCHAIN_ID.toString(16);
const ZERO_BLOOM    = "0x" + "0".repeat(512);
const EMPTY_UNCLE_HASH = "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347";
const common = createEmberchainCommon();

function toHex(n: number | bigint): string { return "0x" + n.toString(16); }
function toQuantity(s: string): string { const h = BigInt(s).toString(16); return "0x" + (h || "0"); }

function formatBlock(block: StoredBlock, txs: StoredTransaction[], fullTx: boolean) {
  const ts = Math.floor(new Date(block.timestamp).getTime() / 1000);
  return {
    number: toHex(block.number), hash: block.hash, parentHash: block.parentHash,
    nonce: "0x0000000000000000", sha3Uncles: EMPTY_UNCLE_HASH, logsBloom: ZERO_BLOOM,
    transactionsRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
    stateRoot: block.stateRoot,
    receiptsRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
    miner: block.miner, difficulty: toQuantity(block.difficulty), totalDifficulty: "0x0",
    extraData: "0x", size: "0x400", gasLimit: "0x1c9c380", gasUsed: "0x0",
    timestamp: toHex(ts),
    transactions: fullTx ? txs.map((tx) => formatTx(tx, block.hash)) : txs.map((tx) => tx.hash),
    uncles: [], baseFeePerGas: "0x0",
  };
}

function formatTx(tx: StoredTransaction, blockHash?: string) {
  const blk = blockHash ?? chain.getBlockForTx(tx.hash)?.hash ?? null;
  return {
    blockHash: blk, blockNumber: tx.blockNumber !== null ? toHex(tx.blockNumber) : null,
    from: tx.from, gas: toQuantity(tx.gasLimit), gasPrice: "0x" + GAS_PRICE.toString(16),
    maxFeePerGas: "0x" + GAS_PRICE.toString(16), maxPriorityFeePerGas: "0x" + GAS_PRICE.toString(16),
    hash: tx.hash, input: tx.data, nonce: toHex(tx.nonce), to: tx.to ?? null,
    transactionIndex: "0x0", value: toQuantity(tx.value), type: "0x2",
    chainId: CHAIN_ID_HEX, v: "0x0", r: "0x0", s: "0x0",
  };
}

function formatReceipt(tx: StoredTransaction) {
  if (tx.status === "pending") return null;
  const blk = chain.getBlockForTx(tx.hash);
  return {
    blockHash: blk?.hash ?? null, blockNumber: tx.blockNumber !== null ? toHex(tx.blockNumber) : null,
    contractAddress: tx.contractAddress ?? null,
    cumulativeGasUsed: toHex(BigInt(tx.gasUsed ?? "21000")), effectiveGasPrice: "0x0",
    from: tx.from, gasUsed: toHex(BigInt(tx.gasUsed ?? "21000")), logs: [], logsBloom: ZERO_BLOOM,
    status: tx.status === "confirmed" ? "0x1" : "0x0",
    to: tx.to ?? null, transactionHash: tx.hash, transactionIndex: "0x0", type: "0x2",
  };
}

function rpcError(code: number, message: string): Error & { rpcCode: number } {
  const e = new Error(message) as Error & { rpcCode: number };
  e.rpcCode = code;
  return e;
}

async function dispatch(method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case "eth_chainId":       return CHAIN_ID_HEX;
    case "net_version":       return String(EMBERCHAIN_ID);
    case "eth_blockNumber": {
      const status = await chain.getStatus();
      return toHex(status.height);
    }
    case "eth_getBalance": {
      const [address, _tag] = params as [string, string];
      const wallet = await chain.getWallet(address as `0x${string}`);
      return toQuantity(wallet?.balance ?? "0");
    }
    case "eth_getTransactionCount": {
      const [address] = params as [string];
      const wallet = await chain.getWallet(address as `0x${string}`);
      return toHex(wallet?.nonce ?? 0);
    }
    case "eth_getCode": {
      const [address] = params as [string];
      const code = await chain.getCode(address as PrefixedHexString);
      return code ?? "0x";
    }
    case "eth_getStorageAt": {
      const [address, slot] = params as [string, string];
      const val = await chain.getStorageAt(address as PrefixedHexString, slot as PrefixedHexString);
      return val ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
    case "eth_getBlockByNumber": {
      const [tag, fullTx] = params as [string, boolean];
      const num = tag === "latest" || tag === "pending"
        ? (await chain.getStatus()).height
        : parseInt(tag, 16);
      const block = await chain.getBlock(num);
      if (!block) return null;
      const txs = await Promise.all(block.transactionHashes.map((h) => chain.getTransaction(h)));
      return formatBlock(block, txs.filter((t): t is StoredTransaction => t !== null), fullTx ?? false);
    }
    case "eth_getBlockByHash": {
      const [hash, fullTx] = params as [string, boolean];
      const block = chain.getBlockByHash(hash);
      if (!block) return null;
      const txs = await Promise.all(block.transactionHashes.map((h) => chain.getTransaction(h)));
      return formatBlock(block, txs.filter((t): t is StoredTransaction => t !== null), fullTx ?? false);
    }
    case "eth_getTransactionByHash": {
      const [hash] = params as [string];
      const tx = await chain.getTransaction(hash);
      return tx ? formatTx(tx) : null;
    }
    case "eth_getTransactionReceipt": {
      const [hash] = params as [string];
      const tx = await chain.getTransaction(hash);
      return tx ? formatReceipt(tx) : null;
    }
    case "eth_sendRawTransaction": {
      const [raw] = params as [string];
      const txData = createTxFromRLP(hexToBytes(raw as PrefixedHexString), { common });
      const from    = bytesToHex(txData.getSenderAddress().bytes);
      const to      = txData.to ? bytesToHex(txData.to.bytes) : null;
      const value   = txData.value.toString();
      const nonce   = Number(txData.nonce);
      const gasLimit = txData.gasLimit.toString();
      const data    = txData.data ? bytesToHex(txData.data) : "0x";
      const submitted = await chain.submitRawEVMTransaction({ from, to, value, nonce, gasLimit, data, raw });
      return submitted.hash;
    }
    case "eth_call": {
      const [callObj] = params as [{ to?: string; from?: string; data?: string; value?: string }];
      const result = await chain.callContract({
        to: callObj?.to ?? null, data: callObj?.data, from: callObj?.from ?? null,
        value: callObj?.value ? BigInt(callObj.value) : 0n,
      });
      return result ?? "0x";
    }
    case "eth_estimateGas": {
      const [callObj] = params as [{ to?: string; from?: string; data?: string; value?: string } | undefined];
      const gas = await chain.estimateGas({
        to: callObj?.to ?? null, data: callObj?.data, from: callObj?.from ?? null,
        value: callObj?.value ? BigInt(callObj.value) : 0n,
      });
      return "0x" + gas.toString(16);
    }
    case "eth_getLogs":                    return [];
    case "eth_newFilter":
    case "eth_newBlockFilter":
    case "eth_newPendingTransactionFilter": return "0x1";
    case "eth_getFilterChanges":
    case "eth_getFilterLogs":              return [];
    case "eth_uninstallFilter":            return true;
    case "eth_subscribe":
    case "eth_unsubscribe":
      throw rpcError(-32601, "Subscriptions require a WebSocket connection");
    default:
      throw rpcError(-32601, `Method not supported: ${method}`);
  }
}

router.post("/rpc", async (req, res) => {
  const body = req.body as
    | { jsonrpc: string; id: unknown; method: string; params?: unknown[] }
    | Array<{ jsonrpc: string; id: unknown; method: string; params?: unknown[] }>;

  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(async (item) => {
      try {
        return { jsonrpc: "2.0", id: item.id, result: await dispatch(item.method, item.params ?? []) };
      } catch (err) {
        const e = err as Error & { rpcCode?: number };
        return { jsonrpc: "2.0", id: item.id, error: { code: e.rpcCode ?? -32603, message: e.message } };
      }
    }));
    res.json(results);
    return;
  }

  try {
    res.json({ jsonrpc: "2.0", id: body.id, result: await dispatch(body.method, body.params ?? []) });
  } catch (err) {
    const e = err as Error & { rpcCode?: number };
    res.json({ jsonrpc: "2.0", id: body.id, error: { code: e.rpcCode ?? -32603, message: e.message } });
  }
});

export default router;
