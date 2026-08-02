/**
 * Persist Trade events observed when orders are filled (incl. partial fills).
 * Merged into GET /api/dex/trades so history survives RPC scan gaps.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DexTradeLogDto } from "./dex-trade-scan";

const DATA_FILE =
  (process.env.DEX_FILLS_DATA_FILE ?? "").trim() || "./data/dex-fills.json";

interface DexFillsData {
  trades: DexTradeLogDto[];
}

let cache: DexFillsData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function defaultData(): DexFillsData {
  return { trades: [] };
}

function loadData(): DexFillsData {
  if (cache) return cache;
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = { ...defaultData(), ...(JSON.parse(raw) as DexFillsData) };
    cache = { trades: Array.isArray(parsed.trades) ? parsed.trades : [] };
  } catch {
    cache = defaultData();
  }
  return cache!;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 500);
}

function flush(): void {
  if (!cache) return;
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf-8");
    renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error("[dex-fills-store] save failed:", (err as Error).message);
  }
}

export function listRecordedTrades(): DexTradeLogDto[] {
  return loadData().trades;
}

export function upsertRecordedTrades(rows: DexTradeLogDto[]): void {
  if (rows.length === 0) return;
  const data = loadData();
  const seen = new Set(data.trades.map((t) => `${t.transactionHash}:${t.logIndex}`));
  for (const row of rows) {
    const key = `${row.transactionHash}:${row.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    data.trades.push(row);
  }
  data.trades.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });
  scheduleSave();
}
