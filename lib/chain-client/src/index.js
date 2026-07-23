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
const BASE_URL = (process.env["CHAIN_NODE_URL"] ?? "http://localhost:8082").replace(/\/$/, "");
/** Derive the same internal bearer secret that chain-node computes from SESSION_SECRET. */
function deriveInternalSecret() {
    const s = process.env["SESSION_SECRET"];
    if (!s)
        return null;
    return createHmac("sha256", s).update("chain-node-internal-v1").digest("hex");
}
const INTERNAL_SECRET = deriveInternalSecret();
class ChainClientError extends Error {
    status;
    body;
    constructor(status, body, path) {
        const msg = typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : `chain-node returned HTTP ${status} for ${path}`;
        super(msg);
        this.status = status;
        this.body = body;
        this.name = "ChainClientError";
    }
}
function baseHeaders() {
    return { "Content-Type": "application/json" };
}
function internalHeaders() {
    return {
        "Content-Type": "application/json",
        ...(INTERNAL_SECRET ? { "Authorization": `Bearer ${INTERNAL_SECRET}` } : {}),
    };
}
async function get(path) {
    const headers = path.includes("/internal/") ? internalHeaders() : baseHeaders();
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    const body = await res.json();
    if (!res.ok)
        throw new ChainClientError(res.status, body, path);
    return body;
}
async function post(path, data) {
    const headers = path.includes("/internal/") ? internalHeaders() : baseHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers,
        body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    const body = await res.json();
    if (!res.ok)
        throw new ChainClientError(res.status, body, path);
    return body;
}
/** Re-export so callers can inspect chain-node error status */
export { ChainClientError };
// ── Contract helpers ──────────────────────────────────────────────────────────
export async function callContract(opts) {
    return post("/api/internal/call-contract", opts);
}
export async function getContractCode(address) {
    const r = await get(`/api/internal/contract-code/${encodeURIComponent(address)}`);
    return r.code;
}
export async function submitTransaction(input) {
    return post("/api/internal/submit-transaction", input);
}
export async function submitRawEVMTransaction(params) {
    await post("/api/internal/submit-raw-evm-tx", params);
}
export async function getTransaction(hash) {
    try {
        return await get(`/api/transactions/${encodeURIComponent(hash)}`);
    }
    catch (e) {
        if (e instanceof ChainClientError && e.status === 404)
            return undefined;
        throw e;
    }
}
export async function listWallets() {
    return get("/api/wallets");
}
export async function listTransactions(address, limit = 20) {
    const qs = new URLSearchParams();
    if (address)
        qs.set("address", address);
    qs.set("limit", String(limit));
    return get(`/api/transactions?${qs.toString()}`);
}
export async function getBlockForTx(txHash) {
    return get(`/api/internal/block-for-tx/${encodeURIComponent(txHash)}`);
}
export async function listExchangeListings(status) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return get(`/api/internal/exchange/listings${qs}`);
}
export async function getExchangeListing(id) {
    try {
        return await get(`/api/internal/exchange/listings/${encodeURIComponent(id)}`);
    }
    catch (e) {
        if (e instanceof ChainClientError && e.status === 404)
            return undefined;
        throw e;
    }
}
export async function createListing(input) {
    return post("/api/internal/exchange/listings", input);
}
export async function cancelListing(id, sellerPrivateKey) {
    return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/cancel`, { sellerPrivateKey });
}
export async function reserveListing(id, buyerAddress) {
    return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/reserve`, { buyerAddress });
}
export async function lockListingForFulfillment(id, paymentTxHash, buyerAddress) {
    return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/lock`, { paymentTxHash, buyerAddress });
}
export async function unlockListing(id) {
    await post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/unlock`);
}
export async function commitFulfillment(id, buyerAddress, paymentTxHash, selectedNetwork) {
    return post(`/api/internal/exchange/listings/${encodeURIComponent(id)}/commit`, { buyerAddress, paymentTxHash, selectedNetwork });
}
// ── Privacy ───────────────────────────────────────────────────────────────────
export async function getPrivacyStatus() {
    return get("/api/internal/privacy/status");
}
export async function getStealthMeta(address) {
    try {
        return await get(`/api/internal/privacy/meta/${encodeURIComponent(address)}`);
    }
    catch (e) {
        if (e instanceof ChainClientError && e.status === 404)
            return null;
        throw e;
    }
}
export async function getPrivateBalance(privateKey) {
    return post("/api/internal/privacy/balance", { privateKey });
}
export async function shield(input) {
    return post("/api/internal/privacy/shield", input);
}
export async function privateSend(input) {
    return post("/api/internal/privacy/send", input);
}
export async function unshield(input) {
    return post("/api/internal/privacy/unshield", input);
}
export async function listPrivacyLedger(limit = 20) {
    return get(`/api/internal/privacy/ledger?limit=${limit}`);
}
