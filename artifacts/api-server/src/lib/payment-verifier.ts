/**
 * Off-chain payment verification for the P2P Exchange.
 *
 * EVM chains (ETH, USDT, USDC) are read over JSON-RPC via the registry in
 * ./evm-chains — see that file for why RPC replaced the block explorer APIs.
 * Non-EVM currencies still use public REST APIs:
 *   USDT TRC-20 — Tronscan public API (no key)
 *   BTC         — Blockstream.info REST API (no key)
 *   SOL         — Solana public JSON-RPC (no key)
 *
 * The verifier never touches funds or executes transactions.  It only reads
 * public chain data to confirm a payment from the buyer already occurred.
 */

import type { ExchangeCurrency } from "@workspace/chain-core";
import {
  evmRpc,
  ETH_NETWORKS,
  USDT_NETWORKS,
  USDC_NETWORKS,
  ETHEREUM,
  type EvmChainConfig,
  type Erc20TokenConfig,
} from "./evm-chains";

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  confirmations?: number;
}

const BTC_CONFIRMATIONS_REQUIRED = 2;

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // Tron mainnet

// keccak256("Transfer(address,address,uint256)")
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse a human-readable decimal string into the smallest unit bigint. */
function parseDecimal(value: string, decimals: number): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

function networkNames(registry: Record<string, unknown>): string {
  return Object.keys(registry).join(", ");
}

interface EvmReceipt {
  status: string | null;
  blockNumber: string | null;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

async function confirmationsFor(chain: EvmChainConfig, blockNumberHex: string): Promise<number> {
  const tipHex = await evmRpc<string>(chain, "eth_blockNumber", []);
  return parseInt(tipHex, 16) - parseInt(blockNumberHex, 16) + 1;
}

// ── native coin on an EVM chain ───────────────────────────────────────────────

async function verifyNativeEvm(
  chain: EvmChainConfig,
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
): Promise<VerifyResult> {
  const tx = await evmRpc<{ to: string | null; value: string; blockNumber: string | null } | null>(
    chain,
    "eth_getTransactionByHash",
    [txHash],
  );
  if (!tx) return { valid: false, reason: `Transaction not found on ${chain.label}` };
  if (!tx.blockNumber) return { valid: false, reason: "Transaction not yet mined" };

  if (tx.to?.toLowerCase() !== receiveAddress.toLowerCase()) {
    return {
      valid: false,
      reason: `Wrong recipient — tx sends to ${tx.to}, listing expects ${receiveAddress}`,
    };
  }

  // A transfer to a contract can revert while still reporting `to` and `value`,
  // so the receipt status is what actually proves the funds moved.
  const receipt = await evmRpc<EvmReceipt | null>(chain, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { valid: false, reason: "Transaction receipt not available yet" };
  if (receipt.status !== null && receipt.status !== "0x1") {
    return { valid: false, reason: `Transaction reverted on ${chain.label} — no funds were transferred` };
  }

  const sent = BigInt(tx.value);
  const required = parseDecimal(priceAmount, 18);
  if (sent < required) {
    return {
      valid: false,
      reason: `Insufficient payment — sent ${sent} wei, required ${required} wei (${priceAmount})`,
    };
  }

  const confirmations = await confirmationsFor(chain, tx.blockNumber);
  if (confirmations < chain.confirmations) {
    return {
      valid: false,
      reason: `Only ${confirmations} confirmation(s) on ${chain.label} — need ${chain.confirmations} for safety`,
      confirmations,
    };
  }

  return { valid: true, confirmations };
}

// ── ERC-20 token on an EVM chain ──────────────────────────────────────────────

async function verifyErc20(
  token: Erc20TokenConfig,
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
): Promise<VerifyResult> {
  const { chain } = token;
  const receipt = await evmRpc<EvmReceipt | null>(chain, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { valid: false, reason: `Transaction not found on ${chain.label}` };
  if (!receipt.blockNumber) return { valid: false, reason: "Transaction not yet mined" };
  if (receipt.status !== null && receipt.status !== "0x1") {
    return { valid: false, reason: `Transaction reverted on ${chain.label} — no funds were transferred` };
  }

  // Sum every matching Transfer, since a payment may be split across logs.
  let received = 0n;
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== token.address.toLowerCase()) continue;
    if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const to = "0x" + (log.topics[2] ?? "").slice(26);
    if (to.toLowerCase() !== receiveAddress.toLowerCase()) continue;
    received += BigInt(log.data);
  }

  if (received === 0n) {
    return {
      valid: false,
      reason: `No ${token.symbol} transfer to ${receiveAddress} found in this ${chain.label} transaction`,
    };
  }

  const required = parseDecimal(priceAmount, token.decimals);
  if (received < required) {
    return {
      valid: false,
      reason: `Insufficient ${token.symbol} — received ${received}, required ${required} (${priceAmount} ${token.symbol})`,
    };
  }

  const confirmations = await confirmationsFor(chain, receipt.blockNumber);
  if (confirmations < chain.confirmations) {
    return {
      valid: false,
      reason: `Only ${confirmations} confirmation(s) on ${chain.label} — need ${chain.confirmations} for safety`,
      confirmations,
    };
  }

  return { valid: true, confirmations };
}

// ── public entry point ────────────────────────────────────────────────────────

export async function verifyPayment(
  currency: ExchangeCurrency,
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
  selectedNetwork?: string,
): Promise<VerifyResult> {
  try {
    switch (currency) {
      case "ETH":  return await verifyEth(txHash, receiveAddress, priceAmount, selectedNetwork);
      case "USDT": return await verifyUsdt(txHash, receiveAddress, priceAmount, selectedNetwork);
      case "USDC": return await verifyUsdc(txHash, receiveAddress, priceAmount, selectedNetwork);
      case "BTC":  return await verifyBtc(txHash, receiveAddress, priceAmount);
      case "SOL":  return await verifySol(txHash, receiveAddress, priceAmount);
    }
    return { valid: false, reason: `Unsupported currency: ${String(currency)}` };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "Verification failed" };
  }
}

// ── ETH (Ethereum / Base / Arbitrum) ──────────────────────────────────────────

async function verifyEth(
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
  selectedNetwork?: string,
): Promise<VerifyResult> {
  // Listings created before ETH became multi-chain carry no network — those were
  // all Ethereum mainnet.
  const chain = ETH_NETWORKS[selectedNetwork ?? ETHEREUM.key];
  if (!chain) {
    return {
      valid: false,
      reason: `Unknown ETH network: ${selectedNetwork}. Supported: ${networkNames(ETH_NETWORKS)}.`,
    };
  }
  return verifyNativeEvm(chain, txHash, receiveAddress, priceAmount);
}

// ── USDT (multi-chain router) ─────────────────────────────────────────────────

async function verifyUsdt(
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
  selectedNetwork?: string,
): Promise<VerifyResult> {
  const network = selectedNetwork ?? "ERC-20";
  if (network === "TRC-20") {
    return verifyUsdtTrc20(txHash, receiveAddress, priceAmount);
  }
  const token = USDT_NETWORKS[network];
  if (!token) {
    return {
      valid: false,
      reason: `Unknown USDT network: ${network}. Supported: ${networkNames(USDT_NETWORKS)}, TRC-20.`,
    };
  }
  return verifyErc20(token, txHash, receiveAddress, priceAmount);
}

// ── USDC (Base / Arbitrum / Ethereum) ─────────────────────────────────────────

async function verifyUsdc(
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
  selectedNetwork?: string,
): Promise<VerifyResult> {
  const token = USDC_NETWORKS[selectedNetwork ?? "Base"];
  if (!token) {
    return {
      valid: false,
      reason: `Unknown USDC network: ${selectedNetwork}. Supported: ${networkNames(USDC_NETWORKS)}.`,
    };
  }
  return verifyErc20(token, txHash, receiveAddress, priceAmount);
}

// ── USDT TRC-20 (Tron) ───────────────────────────────────────────────────────

async function verifyUsdtTrc20(txHash: string, receiveAddress: string, priceAmount: string): Promise<VerifyResult> {
  // Tronscan public API — no key required
  const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(txHash)}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Tronscan HTTP ${res.status}`);

  type TronTx = {
    confirmed?: boolean;
    confirmations?: number;
    contractRet?: string;
    trc20TransferInfo?: Array<{
      contract_address: string;
      to_address: string;
      amount_str: string;
    }>;
  };
  const tx = (await res.json()) as TronTx;

  if (!tx || !tx.confirmed) {
    return { valid: false, reason: "Tron transaction not found or not yet confirmed" };
  }
  if (tx.contractRet && tx.contractRet !== "SUCCESS") {
    return { valid: false, reason: `Tron transaction failed on-chain: ${tx.contractRet}` };
  }

  const transfer = (tx.trc20TransferInfo ?? []).find(
    (t) => t.contract_address === USDT_TRC20_CONTRACT && t.to_address === receiveAddress,
  );
  if (!transfer) {
    return {
      valid: false,
      reason: `No USDT TRC-20 Transfer to ${receiveAddress} found in this Tron transaction`,
    };
  }

  // USDT on Tron has 6 decimals
  const amountSent = BigInt(transfer.amount_str ?? "0");
  const amountRequired = parseDecimal(priceAmount, 6);
  if (amountSent < amountRequired) {
    return {
      valid: false,
      reason: `Insufficient USDT — sent ${amountSent} (6-dec units), required ${amountRequired} (${priceAmount} USDT)`,
    };
  }

  // Tron finalizes quickly; if confirmed = true that's sufficient
  return { valid: true, confirmations: tx.confirmations ?? 1 };
}

// ── BTC ──────────────────────────────────────────────────────────────────────

async function verifyBtc(txHash: string, receiveAddress: string, priceAmount: string): Promise<VerifyResult> {
  // Blockstream.info — public REST API, no key required
  const res = await fetch(`https://blockstream.info/api/tx/${txHash}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return { valid: false, reason: "Bitcoin transaction not found" };
  if (!res.ok) throw new Error(`Blockstream HTTP ${res.status}`);

  const tx = (await res.json()) as {
    status: { confirmed: boolean; block_height?: number };
    vout: Array<{ scriptpubkey_address?: string; value: number }>; // value in satoshis
  };

  const output = tx.vout.find((o) => o.scriptpubkey_address === receiveAddress);
  if (!output) {
    return { valid: false, reason: `No output to ${receiveAddress} in this Bitcoin transaction` };
  }

  // priceAmount is in BTC; 1 BTC = 100,000,000 satoshis (8 decimals)
  const satoshisRequired = parseDecimal(priceAmount, 8);
  if (BigInt(output.value) < satoshisRequired) {
    return {
      valid: false,
      reason: `Insufficient BTC — output ${output.value} sat, required ${satoshisRequired} sat (${priceAmount} BTC)`,
    };
  }

  if (!tx.status.confirmed) return { valid: false, reason: "Bitcoin transaction not yet confirmed" };

  const tipRes = await fetch("https://blockstream.info/api/blocks/tip/height", {
    signal: AbortSignal.timeout(10_000),
  });
  const tip = (await tipRes.json()) as number;
  const confirmations = tx.status.block_height ? tip - tx.status.block_height + 1 : 0;
  if (confirmations < BTC_CONFIRMATIONS_REQUIRED) {
    return {
      valid: false,
      reason: `Only ${confirmations} confirmation(s) — need ${BTC_CONFIRMATIONS_REQUIRED} for safety`,
      confirmations,
    };
  }

  return { valid: true, confirmations };
}

// ── SOL ──────────────────────────────────────────────────────────────────────

async function verifySol(txHash: string, receiveAddress: string, priceAmount: string): Promise<VerifyResult> {
  // Solana public mainnet RPC — no key needed for basic lookups
  const rpcRes = await fetch("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [txHash, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  type SolTx = {
    meta: { preBalances: number[]; postBalances: number[]; err: unknown };
    transaction: { message: { accountKeys: string[] } };
  };
  const data = (await rpcRes.json()) as { result: SolTx | null };

  if (!data.result) return { valid: false, reason: "Solana transaction not found or not finalized yet" };
  if (data.result.meta.err) return { valid: false, reason: "Solana transaction failed on-chain" };

  const keys = data.result.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k === receiveAddress);
  if (idx === -1) {
    return { valid: false, reason: `Receive address ${receiveAddress} is not an account in this transaction` };
  }

  // Balance change in lamports; 1 SOL = 1,000,000,000 lamports (9 decimals)
  const lamportsReceived =
    (data.result.meta.postBalances[idx] ?? 0) - (data.result.meta.preBalances[idx] ?? 0);
  const lamportsRequired = parseDecimal(priceAmount, 9);

  if (BigInt(lamportsReceived) < lamportsRequired) {
    return {
      valid: false,
      reason: `Insufficient SOL — received ${lamportsReceived} lamports, required ${lamportsRequired} (${priceAmount} SOL)`,
    };
  }

  return { valid: true, confirmations: 1 }; // "finalized" = confirmed
}
