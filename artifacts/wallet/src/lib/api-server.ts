/**
 * Canonical api-server base URL.
 *
 * All EMBR-chain API routes (/api/contracts, /api/tokens, /api/wallets,
 * /api/exchange, /api/community, /api/onramp, /api/bridge, …) live on the
 * api-server, which is always reachable at po-w-chain.replit.app.
 *
 * When the wallet is served from emberchain.org (or any other host) the
 * relative /api/* paths hit nginx's SPA fallback and return HTML, causing
 * JSON parse errors and blank / empty-looking pages.  Pointing all direct
 * fetch() calls at this constant fixes that site-wide for production.
 *
 * In dev the empty string means "same origin" (Vite proxy handles /api/*).
 */
export const API_SERVER = import.meta.env.DEV ? "" : "https://po-w-chain.replit.app";

/**
 * Thin fetch wrapper that prepends API_SERVER to every path.
 * Throws if the response is not ok.
 */
export async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  const url = `${API_SERVER}${path}`;
  const res = await fetch(url, opts);
  // Guard against HTML error pages (nginx SPA fallback, Cloudflare errors, etc.)
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON but got ${ct} from ${url} (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}
