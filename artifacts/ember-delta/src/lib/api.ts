/**
 * API base — matches artifacts/wallet (resolveApiServer + same-origin /api in dev).
 */
import { resolveApiServer } from "@/lib/config";

export { resolveApiServer };

/** Runtime API base (never empty on emberchain.org). */
export function getApiBase(): string {
  return resolveApiServer();
}

/** @deprecated Use getApiBase() — kept for call sites that expect a string constant. */
export const API = typeof location !== "undefined" ? resolveApiServer() : "";

export async function apiFetch(path: string, opts?: RequestInit): Promise<unknown> {
  const url = `${resolveApiServer()}${path}`;
  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON but got ${ct} from ${url} (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`);
  return json;
}
