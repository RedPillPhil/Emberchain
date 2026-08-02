/**
 * Server-side EmberDelta Trade event scan on Base — browsers cannot reliably eth_getLogs.
 */

import { Interface } from "ethers";
import { getBaseProvider } from "./base-provider";

export const EMBER_DELTA_ADDRESS = (
  process.env.EMBER_DELTA_ADDRESS ?? "0x365f70E546e3D4D35745e7C91Cf189956E2fBEFA"
).toLowerCase();

/** First block with EmberDelta activity on Base (July 2026 deploy). Override via env. */
export const BASE_DELTA_FROM_BLOCK = Number(
  process.env.BASE_DELTA_FROM_BLOCK ?? "49120000",
);

const TRADE_ABI = [
  "event Trade(address indexed tokenGet, uint256 amountGet, address indexed tokenGive, uint256 amountGive, address indexed taker, address maker, bytes32 orderHash)",
] as const;

const tradeIface = new Interface([...TRADE_ABI]);
export const TRADE_TOPIC = tradeIface.getEvent("Trade")!.topicHash.toLowerCase();

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
  if ((log.topics[0] ?? "").toLowerCase() !== TRADE_TOPIC) return null;
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

function resolveScanFromBlock(head: number): number {
  const deployFrom =
    Number.isFinite(BASE_DELTA_FROM_BLOCK) && BASE_DELTA_FROM_BLOCK > 0
      ? BASE_DELTA_FROM_BLOCK
      : 0;
  if (head > 0 && deployFrom > 0) return Math.min(deployFrom, head);
  return deployFrom > 0 ? deployFrom : 0;
}

async function scanViaBlockscout(fromBlock: number): Promise<DexTradeLogDto[]> {
  const events: DexTradeLogDto[] = [];
  let nextParams: Record<string, string> | null = null;

  for (let page = 0; page < 80; page++) {
    const qs = nextParams
      ? "?" + new URLSearchParams(nextParams).toString()
      : "";
    const url = `${BLOCKSCOUT_BASE}/api/v2/addresses/${EMBER_DELTA_ADDRESS}/logs${qs}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
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

    const items = body.items ?? [];
    if (items.length === 0) break;

    let oldestOnPage = Number.MAX_SAFE_INTEGER;
    for (const item of items) {
      const blockNum = item.block_number ?? 0;
      oldestOnPage = Math.min(oldestOnPage, blockNum);
      if (blockNum < fromBlock) continue;
      if ((item.topics?.[0] ?? "").toLowerCase() !== TRADE_TOPIC) continue;
      const parsed = parseTradeLog({
        topics: item.topics ?? [],
        data: item.data ?? "0x",
        transactionHash: item.transaction_hash ?? "",
        blockNumber: blockNum,
        logIndex: item.index ?? 0,
      });
      if (parsed) events.push(parsed);
    }

    nextParams = body.next_page_params ?? null;
    if (!nextParams) break;
    // Blockscout pages newest-first — stop once we've passed the deploy block.
    if (oldestOnPage < fromBlock) break;
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
    await new Promise((r) => setTimeout(r, 100));
  }

  return events;
}

let cachedScan: { at: number; fromBlock: number; logs: DexTradeLogDto[] } | null = null;
const CACHE_MS = 45_000;

export async function scanDexTradeLogs(lookback: number): Promise<{
  headBlock: number;
  logs: DexTradeLogDto[];
}> {
  const provider = getBaseProvider();
  const head = provider ? await provider.getBlockNumber() : 0;
  const scanFrom = resolveScanFromBlock(head);
  const filterFrom =
    lookback > 0 && head > lookback ? Math.max(scanFrom, head - lookback) : scanFrom;

  if (
    cachedScan &&
    Date.now() - cachedScan.at < CACHE_MS &&
    cachedScan.fromBlock <= scanFrom
  ) {
    return {
      headBlock: head,
      logs: cachedScan.logs.filter((l) => l.blockNumber >= filterFrom),
    };
  }

  let logs: DexTradeLogDto[] = [];

  // RPC with Trade topic filter is authoritative — Blockscout address/logs mixes
  // Deposit/Withdraw pages and often misses sparse Trade events (e.g. partial fills).
  if (provider && head > scanFrom) {
    logs = await scanViaRpc(scanFrom, head);
  }

  if (logs.length === 0) {
    try {
      logs = await scanViaBlockscout(scanFrom);
    } catch (err) {
      console.error("[dex-trade-scan] blockscout failed:", (err as Error).message);
    }
  } else {
    // Merge any Blockscout-only entries (RPC chunk failures).
    try {
      const fromIndexer = await scanViaBlockscout(scanFrom);
      const seen = new Set(logs.map((l) => `${l.transactionHash}:${l.logIndex}`));
      for (const l of fromIndexer) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (!seen.has(key)) {
          seen.add(key);
          logs.push(l);
        }
      }
    } catch {
      /* RPC result is enough */
    }
  }

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });

  console.info(
    `[dex-trade-scan] ${logs.length} Trade events (blocks ${scanFrom}–${head}, filter ≥${filterFrom})`,
  );

  cachedScan = { at: Date.now(), fromBlock: scanFrom, logs };
  return {
    headBlock: head,
    logs: logs.filter((l) => l.blockNumber >= filterFrom),
  };
}
