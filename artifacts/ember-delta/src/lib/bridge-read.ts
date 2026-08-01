import { encodeFunctionData, parseAbi } from "viem";
import { CHAIN_NODE_URL } from "@/lib/config";
import {
  EMBER_BRIDGE_ADDRESS,
  EMBERCHAIN_BRIDGE_ADDRESS,
  BASE_RPC_URL,
} from "@/lib/bridge-contracts";

const embrBridgeAbi = parseAbi([
  "function usedNonces(uint256 nonce) view returns (bool)",
]);

const baseBridgeAbi = parseAbi([
  "function usedNonces(uint256 nonce) view returns (bool)",
]);

async function rpcEthCall(rpcUrl: string, to: string, data: `0x${string}`): Promise<string> {
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
    const data = encodeFunctionData({
      abi: baseBridgeAbi,
      functionName: "usedNonces",
      args: [BigInt(nonce)],
    });
    const result = await rpcEthCall(BASE_RPC_URL, EMBERCHAIN_BRIDGE_ADDRESS, data);
    return BigInt(result) !== 0n;
  } catch {
    return false;
  }
}

export async function isNonceUsedOnEmbr(nonce: string): Promise<boolean> {
  try {
    const data = encodeFunctionData({
      abi: embrBridgeAbi,
      functionName: "usedNonces",
      args: [BigInt(nonce)],
    });
    const result = await rpcEthCall(`${CHAIN_NODE_URL}/api/rpc`, EMBER_BRIDGE_ADDRESS, data);
    return BigInt(result) !== 0n;
  } catch {
    return false;
  }
}

export async function isBridgeLegComplete(
  direction: "embr_to_base" | "base_to_embr",
  nonce: string,
): Promise<boolean> {
  return direction === "embr_to_base" ? isNonceUsedOnBase(nonce) : isNonceUsedOnEmbr(nonce);
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
