/**
 * Off-chain payment verification for the P2P Exchange.
 *
 * Each currency uses a different public block explorer API:
 *   ETH  — Etherscan (requires ETHERSCAN_API_KEY env var)
 *   USDT — Etherscan (same key, parses ERC-20 Transfer logs)
 *   BTC  — Blockstream.info REST API (no key needed)
 *   SOL  — Solana public JSON-RPC (no key needed)
 *
 * The verifier never touches funds or executes any transactions.
 * It only reads public blockchain data to confirm that a payment
 * from the buyer already occurred.
 */

import type { ExchangeCurrency } from "@workspace/chain-core";

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  confirmations?: number;
}

const ETH_CONFIRMATIONS_REQUIRED = 12;
const BTC_CONFIRMATIONS_REQUIRED = 2;

// USDT (Tether) ERC-20 contract on Ethereum mainnet
const USDT_CONTRACT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
// keccak256("Transfer(address,address,uint256)")
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ── helpers ──────────────────────────────────────────────────────────────────

function etherscanKey(): string {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error("ETHERSCAN_API_KEY is not configured on this server. Ask the server operator to add it.");
  return key;
}

async function etherscanGet(params: Record<string, string>): Promise<unknown> {
  const key = etherscanKey();
  // V2 API — requires chainid; chainid=1 is Ethereum mainnet
  const qs = new URLSearchParams({ chainid: "1", ...params, apikey: key }).toString();
  const res = await fetch(`https://api.etherscan.io/v2/api?${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; message: string; result: unknown };
  // status "0" means the API call failed (not a network error)
  if (json.status === "0" && json.message !== "No transactions found") {
    throw new Error(`Etherscan error: ${json.message}`);
  }
  return json.result;
}

/** Parse a human-readable decimal string into the smallest unit bigint. */
function parseDecimal(value: string, decimals: number): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

// ── public entry point ────────────────────────────────────────────────────────

export async function verifyPayment(
  currency: ExchangeCurrency,
  txHash: string,
  receiveAddress: string,
  priceAmount: string,
): Promise<VerifyResult> {
  try {
    switch (currency) {
      case "ETH":  return await verifyEth(txHash, receiveAddress, priceAmount);
      case "USDT": return await verifyUsdt(txHash, receiveAddress, priceAmount);
      case "BTC":  return await verifyBtc(txHash, receiveAddress, priceAmount);
      case "SOL":  return await verifySol(txHash, receiveAddress, priceAmount);
    }
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : "Verification failed" };
  }
}

// ── ETH ──────────────────────────────────────────────────────────────────────

async function verifyEth(txHash: string, receiveAddress: string, priceAmount: string): Promise<VerifyResult> {
  type EthTx = { to: string | null; value: string; blockNumber: string | null } | null;
  const tx = (await etherscanGet({ module: "proxy", action: "eth_getTransactionByHash", txhash: txHash })) as EthTx;

  if (!tx) return { valid: false, reason: "Transaction not found on Ethereum mainnet" };
  if (tx.to?.toLowerCase() !== receiveAddress.toLowerCase()) {
    return { valid: false, reason: `Wrong recipient — tx sends to ${tx.to}, listing expects ${receiveAddress}` };
  }

  const weiSent = BigInt(tx.value);
  const weiRequired = parseDecimal(priceAmount, 18);
  if (weiSent < weiRequired) {
    return {
      valid: false,
      reason: `Insufficient ETH — sent ${weiSent} wei, required ${weiRequired} wei (${priceAmount} ETH)`,
    };
  }

  if (!tx.blockNumber) return { valid: false, reason: "Transaction not yet mined" };

  const currentBlockHex = (await etherscanGet({ module: "proxy", action: "eth_blockNumber" })) as string;
  const confirmations = parseInt(currentBlockHex, 16) - parseInt(tx.blockNumber, 16);
  if (confirmations < ETH_CONFIRMATIONS_REQUIRED) {
    return {
      valid: false,
      reason: `Only ${confirmations} confirmation(s) — need ${ETH_CONFIRMATIONS_REQUIRED} for safety`,
      confirmations,
    };
  }

  return { valid: true, confirmations };
}

// ── USDT (ERC-20 on Ethereum) ─────────────────────────────────────────────────

async function verifyUsdt(txHash: string, receiveAddress: string, priceAmount: string): Promise<VerifyResult> {
  type Receipt = {
    blockNumber: string | null;
    logs: Array<{ address: string; topics: string[]; data: string }>;
  } | null;

  const receipt = (await etherscanGet({
    module: "proxy",
    action: "eth_getTransactionReceipt",
    txhash: txHash,
  })) as Receipt;

  if (!receipt) return { valid: false, reason: "Transaction not found on Ethereum mainnet" };
  if (!receipt.blockNumber) return { valid: false, reason: "Transaction not yet mined" };

  // Find a USDT Transfer log targeting receiveAddress
  const transferLog = receipt.logs.find((log) => {
    if (log.address.toLowerCase() !== USDT_CONTRACT) return false;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC) return false;
    // topics[2] is the 'to' address, left-padded to 32 bytes
    const toAddr = "0x" + (log.topics[2] ?? "").slice(26);
    return toAddr.toLowerCase() === receiveAddress.toLowerCase();
  });

  if (!transferLog) {
    return {
      valid: false,
      reason: `No USDT Transfer to ${receiveAddress} found in transaction logs`,
    };
  }

  // USDT has 6 decimals; data is the hex-encoded amount
  const amountSent = BigInt(transferLog.data);
  const amountRequired = parseDecimal(priceAmount, 6);
  if (amountSent < amountRequired) {
    return {
      valid: false,
      reason: `Insufficient USDT — sent ${amountSent} (6-dec units), required ${amountRequired} (${priceAmount} USDT)`,
    };
  }

  const currentBlockHex = (await etherscanGet({ module: "proxy", action: "eth_blockNumber" })) as string;
  const confirmations = parseInt(currentBlockHex, 16) - parseInt(receipt.blockNumber, 16);
  if (confirmations < ETH_CONFIRMATIONS_REQUIRED) {
    return {
      valid: false,
      reason: `Only ${confirmations} confirmation(s) — need ${ETH_CONFIRMATIONS_REQUIRED} for safety`,
      confirmations,
    };
  }

  return { valid: true, confirmations };
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
