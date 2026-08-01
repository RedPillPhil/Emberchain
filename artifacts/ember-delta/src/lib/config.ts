function trimUrl(url: string | undefined): string {
  return url?.replace(/\/+$/, "") ?? "";
}

function isEmberchainSite(): boolean {
  if (typeof location === "undefined") return false;
  return /^(www\.)?emberchain\.org$/i.test(location.hostname);
}

const DEFAULT_CHAIN_NODE = "https://emberchain.duckdns.org";

/** Emberchain L1 — build-time default; prefer resolveChainNodeUrl() in browser code. */
export const CHAIN_NODE_URL =
  trimUrl(import.meta.env.VITE_CHAIN_NODE_URL) || DEFAULT_CHAIN_NODE;

/** Optional api-server for bridge register / history */
export const API_SERVER = trimUrl(import.meta.env.VITE_API_URL);

/**
 * Runtime chain-node base URL for browser fetch/RPC.
 * On emberchain.org uses same-origin /api (Vercel proxies to duckdns).
 * In dev uses Vite's /api proxy. Otherwise explicit env or duckdns.
 */
export function resolveChainNodeUrl(): string {
  if (isEmberchainSite()) return "";
  if (import.meta.env.DEV) return "";
  const explicit = trimUrl(import.meta.env.VITE_CHAIN_NODE_URL);
  if (explicit) return explicit;
  return DEFAULT_CHAIN_NODE;
}

function chainNodeOrigin(): string {
  const base = resolveChainNodeUrl();
  if (base) return base;
  if (typeof location !== "undefined") return location.origin;
  return DEFAULT_CHAIN_NODE;
}

/** Absolute URL for a chain-node REST path, e.g. `/api/transactions`. */
export function chainNodeApi(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${chainNodeOrigin()}${p}`;
}

export function chainNodeRpcUrl(): string {
  return chainNodeApi("/api/rpc");
}

/** Resolved API base: explicit env, same-origin on emberchain.org, else chain node. */
export function resolveApiServer(): string {
  if (API_SERVER) return API_SERVER;
  return resolveChainNodeUrl();
}
