/**
 * Production deployment config for the wallet (Vercel, static CDN, etc.).
 *
 * Vercel hosts the wallet UI only. Bridge relay, exchange, and community APIs
 * run on a separate always-on api-server (Railway, Fly.io, VM, etc.).
 *
 * Set these in Vercel → Project → Settings → Environment Variables (build time):
 *   VITE_API_URL        — api-server base URL, e.g. https://api.emberchain.org
 *   VITE_CHAIN_NODE_URL — Emberchain node, default https://emberchain.duckdns.org
 */

function trimUrl(url: string | undefined): string {
  return url?.replace(/\/+$/, "") ?? "";
}

/** Emberchain L1 — balances, blocks, transaction submission */
export const CHAIN_NODE_URL =
  trimUrl(import.meta.env.VITE_CHAIN_NODE_URL) || "https://emberchain.duckdns.org";

/**
 * api-server — bridge register/relayer, exchange escrow, community, onramp.
 * Required for bridge and exchange in production (not served by Vercel).
 */
export const API_SERVER = trimUrl(import.meta.env.VITE_API_URL);

/** Resolved API base: explicit env, else canonical chain node (duckdns). */
export function resolveApiServer(): string {
  if (API_SERVER) return API_SERVER;
  return CHAIN_NODE_URL;
}

export function getCommunityWsUrl(): string {
  const base = resolveApiServer();
  if (base) {
    const url = new URL(base);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${url.host}/api/community/ws`;
  }
  if (typeof location !== "undefined") {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/api/community/ws`;
  }
  return "";
}

export const BRIDGE_CONFIGURED = Boolean(
  import.meta.env.VITE_EMBER_BRIDGE_ADDRESS ||
  import.meta.env.VITE_EMBERCHAIN_BRIDGE_ADDRESS ||
  import.meta.env.PROD,
);
