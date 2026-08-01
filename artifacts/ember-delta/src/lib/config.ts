function trimUrl(url: string | undefined): string {
  return url?.replace(/\/+$/, "") ?? "";
}

function isEmberchainSite(): boolean {
  if (typeof location === "undefined") return false;
  return /^(www\.)?emberchain\.org$/i.test(location.hostname);
}

/** Emberchain L1 — balances, blocks, transaction submission */
export const CHAIN_NODE_URL =
  trimUrl(import.meta.env.VITE_CHAIN_NODE_URL) || "https://emberchain.duckdns.org";

/** Optional api-server for bridge register / history */
export const API_SERVER = trimUrl(import.meta.env.VITE_API_URL);

/** Same resolution as the main wallet app */
export function resolveApiServer(): string {
  if (API_SERVER) return API_SERVER;
  // emberchain.org proxies /api → chain-node on Vercel
  if (isEmberchainSite()) return "";
  if (import.meta.env.PROD) return CHAIN_NODE_URL;
  return "";
}
