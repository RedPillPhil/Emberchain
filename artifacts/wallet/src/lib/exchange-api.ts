import type { ExchangeListing } from "@workspace/api-client-react";
import { resolveApiServer, isSelfHostedSite } from "@/lib/config";
import seedListings from "@/data/exchange-listings.seed.json";

/** Legacy Replit api-server — fallback only when self-hosted api-server is unavailable. */
export const LEGACY_EXCHANGE_API =
  import.meta.env.VITE_EXCHANGE_API_URL?.replace(/\/+$/, "") ||
  "https://po-w-chain.replit.app";

const CACHE_KEY = "ember_exchange_listings_v1";

export function resolveExchangeApi(): string {
  const primary = resolveApiServer();
  if (primary) return primary;
  if (isSelfHostedSite()) return "";
  return LEGACY_EXCHANGE_API;
}

function readCache(): ExchangeListing[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExchangeListing[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(listings: ExchangeListing[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(listings));
  } catch {
    /* quota */
  }
}

export async function fetchExchangeListings(status?: string): Promise<ExchangeListing[]> {
  const base = resolveExchangeApi();
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const urls = [base, LEGACY_EXCHANGE_API].filter((v, i, a) => a.indexOf(v) === i);

  for (const url of urls) {
    try {
      const res = await fetch(`${url}/api/exchange/listings${qs}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as ExchangeListing[];
      if (!Array.isArray(data)) continue;
      if (!status) writeCache(data);
      return data;
    } catch {
      continue;
    }
  }

  const cached = readCache();
  const seed = Array.isArray(seedListings) ? (seedListings as ExchangeListing[]) : [];
  const fallback = cached.length ? cached : seed;
  if (!fallback.length) return [];
  return status ? fallback.filter((l) => l.status === status) : fallback;
}

export async function exchangeApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = resolveExchangeApi();
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** Operator manual fulfillment — verifies payment server-side then releases escrowed EMBR to buyer. */
export async function manualFulfillListing(input: {
  listingId: string;
  buyerAddress: string;
  paymentTxHash: string;
  selectedNetwork?: string;
}): Promise<ExchangeListing> {
  return buyListing(input.listingId, {
    buyerAddress: input.buyerAddress,
    paymentTxHash: input.paymentTxHash,
    selectedNetwork: input.selectedNetwork,
  });
}

export async function reserveListing(listingId: string, buyerAddress: string): Promise<ExchangeListing> {
  const res = await exchangeApiFetch(`/api/exchange/listings/${encodeURIComponent(listingId)}/reserve`, {
    method: "POST",
    body: JSON.stringify({ buyerAddress }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as ExchangeListing;
}

export async function buyListing(
  listingId: string,
  body: { buyerAddress: string; paymentTxHash: string; selectedNetwork?: string },
): Promise<ExchangeListing> {
  const res = await exchangeApiFetch(`/api/exchange/listings/${encodeURIComponent(listingId)}/buy`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error ?? `HTTP ${res.status}`) as Error & {
      data?: unknown;
    };
    err.data = json;
    throw err;
  }
  return json as ExchangeListing;
}

export async function createListing(body: Record<string, unknown>): Promise<ExchangeListing> {
  const res = await exchangeApiFetch("/api/exchange/listings", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as ExchangeListing;
}

export async function cancelListing(listingId: string, sellerPrivateKey: string): Promise<ExchangeListing> {
  const res = await exchangeApiFetch(`/api/exchange/listings/${encodeURIComponent(listingId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ sellerPrivateKey }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as ExchangeListing;
}

export function formatListingTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
