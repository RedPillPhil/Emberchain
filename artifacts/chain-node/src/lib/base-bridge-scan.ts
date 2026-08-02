/**
 * Parse EmberchainBridge BridgeOut events from Base mainnet receipts/logs.
 */

import { Contract, Interface } from "ethers";
import { getBaseProvider } from "./base-provider";

export const EMBERCHAIN_BRIDGE_ADDRESS = (
  process.env.EMBERCHAIN_BRIDGE_ADDRESS ?? "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4"
).toLowerCase();

export const BASE_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
] as const;

const baseBridgeIface = new Interface([...BASE_BRIDGE_ABI]);
const BRIDGE_OUT_TOPIC = baseBridgeIface.getEvent("BridgeOut")!.topicHash;

export interface ParsedBaseBridgeOut {
  nonce: string;
  sender: string;
  embrRecipient: string;
  amount: string;
  txHash: string;
  blockNumber: number;
}

export function parseBridgeOutLog(log: {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash: string;
  blockNumber: number;
}): ParsedBaseBridgeOut | null {
  if (log.address.toLowerCase() !== EMBERCHAIN_BRIDGE_ADDRESS) return null;
  if (log.topics[0] !== BRIDGE_OUT_TOPIC) return null;
  try {
    const parsed = baseBridgeIface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });
    if (!parsed || parsed.name !== "BridgeOut") return null;
    return {
      nonce: (parsed.args[3] as bigint).toString(),
      sender: parsed.args[0] as string,
      embrRecipient: parsed.args[1] as string,
      amount: (parsed.args[2] as bigint).toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    };
  } catch {
    return null;
  }
}

export async function fetchBaseBridgeOutByTxHash(txHash: string): Promise<ParsedBaseBridgeOut | null> {
  const provider = getBaseProvider();
  if (!provider) return null;

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return null;

  for (const log of receipt.logs) {
    const parsed = parseBridgeOutLog({
      address: log.address,
      topics: log.topics,
      data: log.data,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    });
    if (parsed) return parsed;
  }
  return null;
}

export async function scanBaseBridgeOuts(lookback: number): Promise<ParsedBaseBridgeOut[]> {
  const provider = getBaseProvider();
  if (!provider) return [];

  const baseBridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
  const baseHeight = await provider.getBlockNumber();
  const baseFrom = Math.max(0, baseHeight - lookback);
  const chunkSize = 10_000;

  const logs: Awaited<ReturnType<Contract["queryFilter"]>> = [];
  for (let from = baseFrom; from <= baseHeight; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, baseHeight);
    try {
      const chunk = await baseBridge.queryFilter(baseBridge.filters.BridgeOut(), from, to);
      logs.push(...chunk);
    } catch (err) {
      console.error("[base-bridge-scan] chunk failed:", from, (err as Error).message);
    }
  }

  const events: ParsedBaseBridgeOut[] = [];
  for (const log of logs) {
    if (!("args" in log) || !log.args) continue;
    events.push({
      nonce: (log.args[3] as bigint).toString(),
      sender: log.args[0] as string,
      embrRecipient: log.args[1] as string,
      amount: (log.args[2] as bigint).toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
    });
  }
  return events;
}
