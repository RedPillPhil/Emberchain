import { Interface } from "ethers";
import { CHAIN_NODE_URL } from "@/lib/config";
import {
  BASE_BRIDGE_ABI,
  BASE_RPC_URL,
  EMBR_BRIDGE_ABI,
  EMBER_BRIDGE_ADDRESS,
  EMBERCHAIN_BRIDGE_ADDRESS,
} from "@/lib/bridge-contracts";

const embrBridgeIface = new Interface([...EMBR_BRIDGE_ABI]);
const baseBridgeIface = new Interface([...BASE_BRIDGE_ABI]);

async function rpcEthCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "eth_call failed");
  if (!json.result) throw new Error("eth_call returned empty result");
  return json.result;
}

export async function isNonceUsedOnBase(nonce: string): Promise<boolean> {
  try {
    const data = baseBridgeIface.encodeFunctionData("usedNonces", [BigInt(nonce)]);
    const result = await rpcEthCall(BASE_RPC_URL, EMBERCHAIN_BRIDGE_ADDRESS, data);
    return BigInt(result) !== 0n;
  } catch {
    return false;
  }
}

export async function isNonceUsedOnEmbr(nonce: string): Promise<boolean> {
  try {
    const data = embrBridgeIface.encodeFunctionData("usedNonces", [BigInt(nonce)]);
    const result = await rpcEthCall(`${CHAIN_NODE_URL}/api/rpc`, EMBER_BRIDGE_ADDRESS, data);
    return BigInt(result) !== 0n;
  } catch {
    return false;
  }
}

export function isNonceAlreadyUsedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /nonce already used/i.test(msg);
}

export async function isBridgeLegComplete(
  direction: "embr_to_base" | "base_to_embr",
  nonce: string,
): Promise<boolean> {
  return direction === "embr_to_base" ? isNonceUsedOnBase(nonce) : isNonceUsedOnEmbr(nonce);
}

const blockTimeCache = new Map<string, number>();

export async function getBaseBlockTimestamp(blockNumber: number): Promise<number | undefined> {
  const key = `base:${blockNumber}`;
  if (blockTimeCache.has(key)) return blockTimeCache.get(key);
  try {
    const res = await fetch(BASE_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBlockByNumber",
        params: [`0x${blockNumber.toString(16)}`, false],
      }),
    });
    const json = (await res.json()) as { result?: { timestamp?: string } };
    const ts = json.result?.timestamp ? Number.parseInt(json.result.timestamp, 16) * 1000 : undefined;
    if (ts) blockTimeCache.set(key, ts);
    return ts;
  } catch {
    return undefined;
  }
}

export function formatBridgeTime(isoOrMs?: string | number): string {
  if (!isoOrMs) return "—";
  const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
