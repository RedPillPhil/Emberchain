/**
 * Server-side EmberDelta Trade event scan on Base — browsers cannot reliably eth_getLogs.
 */

import { Interface } from "ethers";
import { getBaseProvider } from "./base-provider";

export const EMBER_DELTA_ADDRESS = (
  process.env.EMBER_DELTA_ADDRESS ?? "0x365f70E546e3D4D35745e7C91Cf189956E2fBEFA"
).toLowerCase();

const TRADE_ABI = [
  "event Trade(address indexed tokenGet, uint256 amountGet, address indexed tokenGive, uint256 amountGive, address indexed taker, address maker, bytes32 orderHash)",
] as const;

const tradeIface = new Interface([...TRADE_ABI]);
export const TRADE_TOPIC = tradeIface.getEvent("Trade")!.topicHash;

const BLOCKSCOUT_BASE = (
  process.env.BASE_BLOCKSCOUT_URL ?? "https://base.blockscout.com"
).replace(/\/+$/, "");

export interface DexTradeLogDto {
  tokenGet: string;
  amountGet: string;
  tokenGive: string;
  amountGive: string;
  taker: string;
  maker: string;
  orderHash: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

function parseTradeLog(log: {
  topics: readonly string[];
  data: string;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}): DexTradeLogDto | null {
  if (log.topics[0] !== TRADE_TOPIC) return null;
  try {
    const parsed = tradeIface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });
    if (!parsed || parsed.name !== "Trade") return null;
    return {
      tokenGet: parsed.args[0] as string,
      amountGet: (parsed.args[1] as bigint).toString(),
      tokenGive: parsed.args[2] as string,
      amountGive: (parsed.args[3] as bigint).toString(),
      taker: parsed.args[4] as string,
      maker: parsed.args[5] as string,
      orderHash: parsed.args[6] as string,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
    };
  } catch {
    return null;
  }
}

async function scanViaBlockscout(minBlock: number): Promise<DexTradeLogDto[]> {
  const events: DexTradeLogDto[] = [];
  let nextParams: Record<string, string> | null = null;

  for (let page = 0; page < 50; page++) {
    const qs = nextParams
      ? "?" + new URLSearchParams(nextParams).toString()
      : "";
    const url = `${BLOCKSCOUT_BASE}/api/v2/addresses/${EMBER_DELTA_ADDRESS}/logs${qs}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error("[dex-trade-scan] blockscout HTTP", res.status);
      break;
    }

    const body = (await res.json()) as {
      items?: Array<{
        topics?: string[];
        data?: string;
        transaction_hash?: string;
        block_number?: number;
        index?: number;
      }>;
      next_page_params?: Record<string, string> | null;
    };

    for (const item of body.items ?? []) {
      if (!item.topics?.[0] || item.topics[0] !== TRADE_TOPIC) continue;
      if ((item.block_number ?? 0) < minBlock) continue;
      const parsed = parseTradeLog({
        topics: item.topics,
        data: item.data ?? "0x",
        transactionHash: item.transaction_hash ?? "",
        blockNumber: item.block_number ?? 0,
        logIndex: item.index ?? 0,
      });
      if (parsed) events.push(parsed);
    }

    nextParams = body.next_page_params ?? null;
    if (!nextParams) break;
  }

  return events;
}

async function scanViaRpc(fromBlock: number, toBlock: number): Promise<DexTradeLogDto[]> {
  const provider = getBaseProvider();
  if (!provider) return [];

  const chunkSize = 2_000;
  const events: DexTradeLogDto[] = [];

  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(from + chunkSize - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        address: EMBER_DELTA_ADDRESS,
        topics: [TRADE_TOPIC],
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const parsed = parseTradeLog({
          topics: log.topics,
          data: log.data,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          logIndex: log.index,
        });
        if (parsed) events.push(parsed);
      }
    } catch (err) {
      console.error("[dex-trade-scan] rpc chunk failed:", from, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  return events;
}

let cachedScan: { at: number; minBlock: number; logs: DexTradeLogDto[] } | null = null;
const CACHE_MS = 45_000;

export async function scanDexTradeLogs(lookback: number): Promise<{
  headBlock: number;
  logs: DexTradeLogDto[];
}> {
  const provider = getBaseProvider();
  const head = provider ? await provider.getBlockNumber() : 0;
  const minBlock = head > lookback ? head - lookback : 0;

  if (cachedScan && Date.now() - cachedScan.at < CACHE_MS && cachedScan.minBlock <= minBlock) {
    return {
      headBlock: head,
      logs: cachedScan.logs.filter((l) => l.blockNumber >= minBlock),
    };
  }

  let logs: DexTradeLogDto[] = [];
  try {
    logs = await scanViaBlockscout(minBlock);
  } catch (err) {
    console.error("[dex-trade-scan] blockscout failed:", (err as Error).message);
  }

  if (logs.length === 0 && provider && head > 0) {
    logs = await scanViaRpc(minBlock, head);
  }

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });

  cachedScan = { at: Date.now(), minBlock, logs };
  return { headBlock: head, logs };
}
