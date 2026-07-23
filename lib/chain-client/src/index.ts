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

const BASE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");
const INTERNAL_SECRET = process.env["CHAIN_NODE_INTERNAL_SECRET"];

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
  const res = await fetch(`${BASE_URL}${path}`, { headers });
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
}): Promise<{ hash: string; from: string; to: string | null; value: string; blockNumber: number | null }> {
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
  blockNumber: number | null;
  status: "pending" | "confirmed" | "failed";
} | undefined> {
  try {
    return await get(`/api/internal/block-for-tx/${encodeURIComponent(hash)}`);
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
