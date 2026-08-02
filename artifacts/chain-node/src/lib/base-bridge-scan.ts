/**
 * Parse EmberchainBridge BridgeOut events from Base mainnet receipts/logs.
 */

import { Interface } from "ethers";
import { getBaseProvider } from "./base-provider";

export const EMBERCHAIN_BRIDGE_ADDRESS = (
  process.env.EMBERCHAIN_BRIDGE_ADDRESS ?? "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4"
).toLowerCase();

/** First block with EmberchainBridge activity on Base (OwnershipTransferred). */
export const BASE_BRIDGE_FROM_BLOCK = Number(
  process.env.BASE_BRIDGE_FROM_BLOCK ?? "48803153",
);

export const BASE_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
] as const;

const baseBridgeIface = new Interface([...BASE_BRIDGE_ABI]);
export const BRIDGE_OUT_TOPIC = baseBridgeIface.getEvent("BridgeOut")!.topicHash;

const BLOCKSCOUT_BASE = (
  process.env.BASE_BLOCKSCOUT_URL ?? "https://base.blockscout.com"
).replace(/\/+$/, "");

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

function resolveScanFromBlock(_lookback: number, head: number): number {
  const fromEnv = Number(process.env.BASE_BRIDGE_FROM_BLOCK ?? BASE_BRIDGE_FROM_BLOCK);
  const deployFrom = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : BASE_BRIDGE_FROM_BLOCK;
  // Base→EMBR BridgeOut events are sparse; always scan from contract deploy.
  return head > 0 ? Math.min(deployFrom, head) : deployFrom;
}

/** Indexer scan — avoids public RPC eth_getLogs rate limits over long history. */
async function scanBaseBridgeOutsViaBlockscout(
  minBlock: number,
): Promise<ParsedBaseBridgeOut[]> {
  const events: ParsedBaseBridgeOut[] = [];
  let nextParams: Record<string, string> | null = null;

  for (let page = 0; page < 50; page++) {
    const qs = nextParams
      ? "?" + new URLSearchParams(nextParams).toString()
      : "";
    const url = `${BLOCKSCOUT_BASE}/api/v2/addresses/${EMBERCHAIN_BRIDGE_ADDRESS}/logs${qs}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error("[base-bridge-scan] blockscout HTTP", res.status);
      break;
    }

    const body = (await res.json()) as {
      items?: Array<{
        topics?: string[];
        data?: string;
        transaction_hash?: string;
        block_number?: number;
      }>;
      next_page_params?: Record<string, string> | null;
    };

    for (const item of body.items ?? []) {
      if (!item.topics?.[0] || item.topics[0] !== BRIDGE_OUT_TOPIC) continue;
      if ((item.block_number ?? 0) < minBlock) continue;
      const parsed = parseBridgeOutLog({
        address: EMBERCHAIN_BRIDGE_ADDRESS,
        topics: item.topics,
        data: item.data ?? "0x",
        transactionHash: item.transaction_hash ?? "",
        blockNumber: item.block_number ?? 0,
      });
      if (parsed) events.push(parsed);
    }

    nextParams = body.next_page_params ?? null;
    if (!nextParams) break;
  }

  return events;
}

async function scanBaseBridgeOutsViaRpc(
  fromBlock: number,
  toBlock: number,
): Promise<ParsedBaseBridgeOut[]> {
  const provider = getBaseProvider();
  if (!provider) return [];

  const chunkSize = 2_000;
  const events: ParsedBaseBridgeOut[] = [];

  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        address: EMBERCHAIN_BRIDGE_ADDRESS,
        topics: [BRIDGE_OUT_TOPIC],
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const parsed = parseBridgeOutLog({
          address: log.address,
          topics: log.topics,
          data: log.data,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
        });
        if (parsed) events.push(parsed);
      }
    } catch (err) {
      console.error("[base-bridge-scan] rpc chunk failed:", from, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return events;
}

let cachedScan: { at: number; minBlock: number; events: ParsedBaseBridgeOut[] } | null = null;
const CACHE_MS = 120_000;

export async function scanBaseBridgeOuts(lookback: number): Promise<ParsedBaseBridgeOut[]> {
  const provider = getBaseProvider();
  const head = provider ? await provider.getBlockNumber() : 0;
  const minBlock = head > 0 ? resolveScanFromBlock(lookback, head) : BASE_BRIDGE_FROM_BLOCK;

  if (cachedScan && Date.now() - cachedScan.at < CACHE_MS && cachedScan.minBlock <= minBlock) {
    return cachedScan.events.filter((e) => e.blockNumber >= minBlock);
  }

  let events: ParsedBaseBridgeOut[] = [];
  try {
    events = await scanBaseBridgeOutsViaBlockscout(minBlock);
  } catch (err) {
    console.error("[base-bridge-scan] blockscout failed:", (err as Error).message);
  }

  if (events.length === 0 && provider && head > 0) {
    events = await scanBaseBridgeOutsViaRpc(minBlock, head);
  }

  const byNonce = new Map<string, ParsedBaseBridgeOut>();
  for (const ev of events) {
    byNonce.set(ev.nonce, ev);
  }
  const deduped = [...byNonce.values()].sort((a, b) => b.blockNumber - a.blockNumber);

  cachedScan = { at: Date.now(), minBlock, events: deduped };
  return deduped;
}
