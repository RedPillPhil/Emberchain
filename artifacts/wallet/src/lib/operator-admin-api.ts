import { Wallet } from "ethers";
import { chainNodeApi, resolveApiServer } from "@/lib/config";

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

/** Signed headers for operator admin API — private key never leaves the browser. */
export async function operatorAdminHeaders(privateKey: string): Promise<Record<string, string>> {
  const wallet = new Wallet(normalizeKey(privateKey));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await wallet.signMessage(`ember-operator:${timestamp}`);
  return {
    "x-relayer-address": wallet.address,
    "x-relayer-timestamp": timestamp,
    "x-relayer-signature": signature,
  };
}

export async function operatorAdminFetch(
  privateKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = resolveApiServer();
  if (!base) throw new Error("API server URL not configured");
  const auth = await operatorAdminHeaders(privateKey);
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers });
}

/** Signed fetch to chain-node (bridge admin routes on self-hosted nginx). */
export async function chainNodeOperatorFetch(
  privateKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const auth = await operatorAdminHeaders(privateKey);
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(chainNodeApi(p), { ...init, headers });
}
