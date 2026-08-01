import { resolveApiServer, CHAIN_NODE_URL } from "@/lib/config";

export { resolveApiServer, CHAIN_NODE_URL };

export async function apiFetch(path: string, opts?: RequestInit): Promise<any> {
  const url = `${resolveApiServer()}${path}`;
  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON but got ${ct} from ${url} (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}
