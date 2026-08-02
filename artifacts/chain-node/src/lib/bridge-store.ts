/**
 * File-backed bridge event store for chain-node (duckdns / Netlify proxy).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DATA_FILE =
  (process.env.BRIDGE_EVENTS_DATA_FILE ?? "").trim() || "./data/bridge-events.json";

export type BridgeDirection = "embr_to_base" | "base_to_embr";
export type BridgeStatus = "pending" | "relayed" | "failed";

export interface BridgeEvent {
  id: number;
  nonce: string;
  direction: BridgeDirection;
  sender: string;
  recipient: string;
  amount: string;
  status: BridgeStatus;
  txHashSrc: string | null;
  txHashDst: string | null;
  errorMsg: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface BridgeData {
  nextId: number;
  events: Record<string, BridgeEvent>;
}

let cache: BridgeData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function defaultData(): BridgeData {
  return { nextId: 1, events: {} };
}

function loadData(): BridgeData {
  if (cache) return cache;
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = { ...defaultData(), ...(JSON.parse(raw) as BridgeData) };
    if (!parsed.events || typeof parsed.events !== "object") parsed.events = {};
    cache = parsed;
  } catch (err) {
    console.error("[bridge-store] load failed:", (err as Error).message);
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
    console.error("[bridge-store] save failed:", (err as Error).message);
  }
}

export interface CreateBridgeEventParams {
  nonce: string;
  direction: BridgeDirection;
  sender: string;
  recipient: string;
  amount: string;
  txHashSrc?: string;
}

export type CreateBridgeEventResult =
  | { kind: "inserted"; event: BridgeEvent }
  | { kind: "conflict" };

export async function createBridgeEvent(
  params: CreateBridgeEventParams,
): Promise<CreateBridgeEventResult> {
  const data = loadData();
  const key = params.nonce;
  if (data.events[key]) return { kind: "conflict" };

  const now = new Date().toISOString();
  const event: BridgeEvent = {
    id: data.nextId++,
    nonce: params.nonce,
    direction: params.direction,
    sender: params.sender.toLowerCase(),
    recipient: params.recipient.toLowerCase(),
    amount: params.amount,
    status: "pending",
    txHashSrc: params.txHashSrc ?? null,
    txHashDst: null,
    errorMsg: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  data.events[key] = event;
  scheduleSave();
  return { kind: "inserted", event };
}

export async function getBridgeEventByNonce(nonce: string): Promise<BridgeEvent | null> {
  return loadData().events[nonce] ?? null;
}

export async function getBridgeHistoryForAddress(address: string): Promise<BridgeEvent[]> {
  const addr = address.toLowerCase();
  return Object.values(loadData().events)
    .filter((e) => e.sender === addr || e.recipient === addr)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);
}
