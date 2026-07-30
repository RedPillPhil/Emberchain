/**
 * Lazy singleton Base (L2) JSON-RPC provider.
 *
 * Shared so every caller (bridge relayer, DEX order verification, etc.) reuses
 * the same connection pool instead of spawning new sockets per request.
 *
 * Returns null when BASE_RPC_URL is not configured — callers must handle this.
 */
import { ethers } from "ethers";

let _provider: ethers.JsonRpcProvider | null | undefined = undefined; // undefined = not yet initialised

export function getBaseProvider(): ethers.JsonRpcProvider | null {
  if (_provider !== undefined) return _provider;
  const url = process.env["BASE_RPC_URL"];
  _provider = url ? new ethers.JsonRpcProvider(url) : null;
  return _provider;
}
