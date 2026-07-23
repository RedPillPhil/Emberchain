/**
 * chain-client — thin HTTP wrapper used by api-server to talk to chain-node.
 *
 * All methods read CHAIN_NODE_URL from the environment (default:
 * http://localhost:8082). They throw on non-2xx responses so callers can
 * propagate the error naturally.
 *
 * Internal endpoints (/api/internal/*) require service-to-service auth.
 * The shared secret is read from CHAIN_NODE_INTERNAL_SECRET.
 */

import { createHmac } from "node:crypto";
import { Pool } from "undici";

const BASE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");

/**
 * Persistent connection pool to chain-node.
 * Reusing connections eliminates per-request TCP handshakes and prevents
 * file-descriptor exhaustion under high mining-share load.
 */
const pool = new Pool(BASE_URL, {
  connections: 20,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

/** Resolve the internal bearer secret that chain-node expects.
 *  Prefers CHAIN_NODE_INTERNAL_SECRET; falls back to HMAC derivation from SESSION_SECRET. */
function resolveInternalSecret(): string | null {
  const explicit = process.env["CHAIN_NODE_INTERNAL_SECRET"];
  if (explicit) return explicit;
  const s = process.env["SESSION_SECRET"];
  if (!s) return null;
  return createHmac("sha256", s).update("chain-node-internal-v1").digest("hex");
}

const INTERNAL_SECRET = resolveInternalSecret();

class ChainClientError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, path: string) {
    const msg = typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: string }).error)
      : `chain-node returned HTTP ${status} for ${path}`;
    super(msg);
    this.status = status;
    this.body = body;
    this.name = "ChainClientError";
  }
}

function baseHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_SECRET ? { "Authorization": `Bearer ${INTERNAL_SECRET}` } : {}),
  };
}

async function get<T>(path: string): Promise<T> {
  const headers = path.includes("/internal/") ? internalHeaders() : baseHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    // @ts-expect-error — undici dispatcher is not in standard RequestInit types
    dispatcher: pool,
  });
  const body = await res.json() as T;
  if (!res.ok) throw new ChainClientError(res.status, body, path);
  return body;
}

async function post<T>(path: string, data?: unknown): Promise<T> {
  const headers = path.includes("/internal/") ? internalHeaders() : baseHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    // @ts-expect-error — undici dispatcher is not in standard RequestInit types
    dispatcher: pool,
  });
  const body = await res.json() as T;
  if (!res.ok) throw new ChainClientError(res.status, body, path);
  return body;
}

/** Re-export so callers can inspect chain-node error status */
export { ChainClientError };

// ── Contract helpers ──────────────────────────────────────────────────────────

export async function callContract(opts: {
  to: string;
  data: string;
  from?: string | null;
}): Promise<{ success: boolean; returnData: string; gasUsed: string }> {
  return post("/api/internal/call-contract", opts);
}

export async function getContractCode(address: string): Promise<string> {
  const r = await get<{ code: string }>(`/api/internal/contract-code/${encodeURIComponent(address)}`);
  return r.code;
}

export async function submitTransaction(input: {
  fromPrivateKey: string;
  to: string | null;
  value?: string;
  data?: string;
  gasLimit?: string;
}): Promise<{ hash: string; from: string; to: string | null; value: string; blockNumber: number | null; status: "pending" | "confirmed" | "failed" }> {
  return post("/api/internal/submit-transaction", input);
}

export async function submitRawEVMTransaction(params: {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  data: string;
  gasLimit: string;
  nonce: bigint;
}): Promise<void> {
  await post("/api/internal/submit-raw-evm-tx", params);
}

export async function getTransaction(hash: string): Promise<{
  hash: string;
  from: string;
  to: string | null;
  value: string;
  data: string;
  blockNumber: number | null;
  status: "pending" | "confirmed" | "failed";
  error?: string | null;
} | undefined> {
  try {
    return await get(`/api/transactions/${encodeURIComponent(hash)}`);
  } catch (e) {
    if (e instanceof ChainClientError && e.status === 404) return undefined;
    throw e;
  }
}

export async function listWallets(): Promise<{ address: string; balance: string; nonce: number }[]> {
  return get("/api/wallets");
}

export async function listTransactions(address?: string, limit = 20): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (address) qs.set("address", address);
  qs.set("limit", String(limit));
  return get(`/api/transactions?${qs.toString()}`);
}

export async function getBlockForTx(txHash: string): Promise<unknown | null> {
  return get(`/api/internal/block-for-tx/${encodeURIComponent(txHash)}`);
}

// ── Exchange ──────────────────────────────────────────────────────────────────

type ExchangeListing = {
  id: string;
  sellerAddress: string;
  currency: string;
  priceAmount: string;
  receiveAddress: string;
  networkAddresses?: Record<string, string>;
  status: string;
  buyerAddress?: string | null;
  paymentTxHash?: string | null;
};

export async function listExchangeListings(status?: string): Promise<ExchangeListing[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return get(`/api/internal/exchange/listings${qs}`);
}

export async function getExchangeListing(id: string): Promise<ExchangeListing | undefined> {
  try {
    return await get(`/api/internal/exchange/listings/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ChainClientError && e.status === 404) return undefined;
    throw e;
  }
}

export async function createListing(input: unknown): Promise<ExchangeListing> {
  return post("/api/internal/exchange/listings", input);
}

export async function cancelListing(id: string, sellerPrivateKey: string): Promise<ExchangeListing> {
  return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/cancel`, { sellerPrivateKey });
}

export async function reserveListing(id: string, buyerAddress: string): Promise<ExchangeListing> {
  return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/reserve`, { buyerAddress });
}

export async function lockListingForFulfillment(id: string, paymentTxHash: string, buyerAddress: string): Promise<ExchangeListing> {
  return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/lock`, { paymentTxHash, buyerAddress });
}

export async function unlockListing(id: string): Promise<void> {
  await post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/unlock`);
}

export async function commitFulfillment(id: string, buyerAddress: string, paymentTxHash: string, selectedNetwork?: string): Promise<ExchangeListing> {
  return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/commit`, { buyerAddress, paymentTxHash, selectedNetwork });
}

// ── Privacy ───────────────────────────────────────────────────────────────────

export async function getPrivacyStatus(): Promise<{ totalNotes: number; unspentNotes: number; shieldedTxCount: number }> {
  return get("/api/internal/privacy/status");
}

export async function getStealthMeta(address: string): Promise<unknown | null> {
  try {
    return await get(`/api/internal/privacy/meta/${encodeURIComponent(address)}`);
  } catch (e) {
    if (e instanceof ChainClientError && e.status === 404) return null;
    throw e;
  }
}

export async function getPrivateBalance(privateKey: string): Promise<{
  balance: string;
  notes: number;
}> {
  return post("/api/internal/privacy/balance", { privateKey });
}

export async function shield(input: unknown): Promise<unknown> {
  return post("/api/internal/privacy/shield", input);
}

export async function privateSend(input: unknown): Promise<unknown> {
  return post("/api/internal/privacy/send", input);
}

export async function unshield(input: unknown): Promise<unknown> {
  return post("/api/internal/privacy/unshield", input);
}

export async function listPrivacyLedger(limit = 20): Promise<unknown[]> {
  return get(`/api/internal/privacy/ledger?limit=${limit}`);
}
