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

function eventKey(direction: BridgeDirection, nonce: string): string {
  return `${direction}:${nonce}`;
}

function normalizeEventsRecord(events: unknown): Record<string, BridgeEvent> {
  if (!events || typeof events !== "object" || Array.isArray(events)) return {};
  const out: Record<string, BridgeEvent> = {};
  for (const [key, event] of Object.entries(events as Record<string, unknown>)) {
    if (!event || typeof event !== "object") continue;
    const e = event as BridgeEvent;
    if (!e.nonce || !e.direction) continue;
    out[key] = e;
  }
  return out;
}

function migrateLegacyKeys(data: BridgeData): void {
  if (!data.events || Array.isArray(data.events)) {
    data.events = {};
    return;
  }
  const legacy = Object.entries(data.events);
  for (const [key, event] of legacy) {
    if (key.includes(":")) continue;
    if (!event || typeof event !== "object") {
      delete data.events[key];
      continue;
    }
    const direction = event.direction ?? "embr_to_base";
    const migrated = eventKey(direction, key);
    if (!data.events[migrated]) {
      data.events[migrated] = { ...event, direction };
    }
    delete data.events[key];
  }
}

function loadData(): BridgeData {
  if (cache) return cache;
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = { ...defaultData(), ...(JSON.parse(raw) as BridgeData) };
    parsed.events = normalizeEventsRecord(parsed.events);
    migrateLegacyKeys(parsed);
    if (typeof parsed.nextId !== "number" || parsed.nextId < 1) parsed.nextId = 1;
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
  const key = eventKey(params.direction, params.nonce);
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

export async function getBridgeEventByNonce(
  nonce: string,
  direction?: BridgeDirection,
): Promise<BridgeEvent | null> {
  const data = loadData();
  if (direction) return data.events[eventKey(direction, nonce)] ?? null;
  return (
    data.events[eventKey("embr_to_base", nonce)]
    ?? data.events[eventKey("base_to_embr", nonce)]
    ?? null
  );
}

export async function getBridgeEventByTxHash(txHash: string): Promise<BridgeEvent | null> {
  const normalized = txHash.toLowerCase();
  return Object.values(loadData().events).find(
    (e) => e.txHashSrc?.toLowerCase() === normalized,
  ) ?? null;
}

export async function listPendingByDirection(direction: BridgeDirection): Promise<BridgeEvent[]> {
  try {
    return Object.values(loadData().events)
      .filter((e) => e?.direction === direction && e.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Record an in-flight destination tx so the relayer does not submit duplicates. */
export async function setBridgeTxHashDst(
  nonce: string,
  direction: BridgeDirection,
  txHashDst: string,
): Promise<void> {
  const data = loadData();
  const key = eventKey(direction, nonce);
  const event = data.events[key];
  if (!event || event.status !== "pending") return;
  event.txHashDst = txHashDst;
  event.updatedAt = new Date().toISOString();
  scheduleSave();
}

export async function recordBridgeAttempt(
  nonce: string,
  direction: BridgeDirection,
  errorMsg: string,
  maxRetries = 5,
): Promise<void> {
  const data = loadData();
  const key = eventKey(direction, nonce);
  const event = data.events[key];
  if (!event || event.status === "relayed") return;
  event.retryCount += 1;
  event.errorMsg = errorMsg;
  if (event.retryCount >= maxRetries) event.status = "failed";
  event.updatedAt = new Date().toISOString();
  scheduleSave();
}

export async function markBridgeRelayed(
  nonce: string,
  direction: BridgeDirection,
  txHashDst?: string,
): Promise<void> {
  const data = loadData();
  const key = eventKey(direction, nonce);
  const event = data.events[key];
  if (!event) return;
  event.status = "relayed";
  if (txHashDst) event.txHashDst = txHashDst;
  event.updatedAt = new Date().toISOString();
  scheduleSave();
}

export async function markBridgeFailed(
  nonce: string,
  direction: BridgeDirection,
  errorMsg?: string,
): Promise<void> {
  const data = loadData();
  const key = eventKey(direction, nonce);
  const event = data.events[key];
  if (!event || event.status === "relayed") return;
  event.status = "failed";
  if (errorMsg) event.errorMsg = errorMsg;
  event.updatedAt = new Date().toISOString();
  scheduleSave();
}

/** Persist admin completion so scans never surface this bridge again. */
export async function upsertBridgeRelayed(params: {
  direction: BridgeDirection;
  nonce: string;
  txHashSrc?: string;
  txHashDst?: string;
  sender?: string;
  recipient?: string;
  amount?: string;
}): Promise<void> {
  const data = loadData();
  const key = eventKey(params.direction, params.nonce);
  const now = new Date().toISOString();
  const existing = data.events[key];
  if (existing) {
    existing.status = "relayed";
    if (params.txHashDst) existing.txHashDst = params.txHashDst;
    if (params.txHashSrc && !existing.txHashSrc) existing.txHashSrc = params.txHashSrc;
    existing.updatedAt = now;
  } else {
    data.events[key] = {
      id: data.nextId++,
      nonce: params.nonce,
      direction: params.direction,
      sender: (params.sender ?? "").toLowerCase(),
      recipient: (params.recipient ?? "").toLowerCase(),
      amount: params.amount ?? "0",
      status: "relayed",
      txHashSrc: params.txHashSrc ?? null,
      txHashDst: params.txHashDst ?? null,
      errorMsg: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  scheduleSave();
}

export function isBridgeRelayed(direction: BridgeDirection, nonce: string): boolean {
  const event = loadData().events[eventKey(direction, nonce)];
  return event?.status === "relayed";
}

export function listRelayedKeys(): string[] {
  const keys: string[] = [];
  try {
    for (const e of Object.values(loadData().events)) {
      if (!e || e.status !== "relayed") continue;
      if (e.direction && e.nonce) keys.push(eventKey(e.direction, e.nonce));
      if (e.txHashSrc) keys.push(`tx:${e.txHashSrc.toLowerCase()}`);
    }
  } catch (err) {
    console.error("[bridge-store] listRelayedKeys failed:", (err as Error).message);
  }
  return keys;
}

export async function getBridgeHistoryForAddress(address: string): Promise<BridgeEvent[]> {
  const addr = address.toLowerCase();
  return Object.values(loadData().events)
    .filter((e) => e.sender === addr || e.recipient === addr)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);
}
