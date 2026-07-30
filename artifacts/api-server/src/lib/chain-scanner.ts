/**
 * chain-scanner (api-server residual)
 *
 * The background scanning loop now runs inside chain-node, which has direct
 * access to the Blockchain instance. This file retains only the ERC-20
 * detection helpers that contracts.ts needs so it can auto-detect tokens
 * when responding to GET /api/contracts/:address or GET /api/tokens/:address.
 *
 * Detection is done by forwarding callContract requests to chain-node via
 * chain-client, so no direct chain-core dependency is needed here.
 */

import { ethers } from "ethers";
import * as chainClient from "@workspace/chain-client";

const coder = ethers.AbiCoder.defaultAbiCoder();

async function callView(
  to: string,
  selector: string,
  types: string[],
): Promise<unknown[] | null> {
  try {
    const result = await chainClient.callContract({ to, data: selector });
    if (!result.success || !result.returnData || result.returnData === "0x") return null;
    return coder.decode(types, result.returnData) as unknown[];
  } catch {
    return null;
  }
}

export async function detectERC20(address: string): Promise<{
  name: string; symbol: string; decimals: number; totalSupply: string;
} | null> {
  const [nameR, symbolR, decimalsR, supplyR] = await Promise.all([
    callView(address, "0x06fdde03", ["string"]),   // name()
    callView(address, "0x95d89b41", ["string"]),   // symbol()
    callView(address, "0x313ce567", ["uint8"]),    // decimals()
    callView(address, "0x18160ddd", ["uint256"]),  // totalSupply()
  ]);
  if (!nameR || !symbolR) return null;
  return {
    name:        String(nameR[0]),
    symbol:      String(symbolR[0]),
    decimals:    decimalsR ? Number(decimalsR[0]) : 18,
    totalSupply: supplyR  ? String(supplyR[0])    : "0",
  };
}

export async function callViewRaw(
  to: string,
  selector: string,
  types: string[],
): Promise<unknown[] | null> {
  return callView(to, selector, types);
}
