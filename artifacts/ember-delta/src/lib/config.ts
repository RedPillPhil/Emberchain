function trimUrl(url: string | undefined): string {
  return url?.replace(/\/+$/, "") ?? "";
}

/** Emberchain L1 — balances, blocks, transaction submission */
export const CHAIN_NODE_URL =
  trimUrl(import.meta.env.VITE_CHAIN_NODE_URL) || "https://emberchain.duckdns.org";

/** Optional api-server for bridge register / history */
export const API_SERVER = trimUrl(import.meta.env.VITE_API_URL);

/** Same resolution as the main wallet app */
export function resolveApiServer(): string {
  if (API_SERVER) return API_SERVER;
  if (import.meta.env.PROD) return CHAIN_NODE_URL;
  return "";
}
