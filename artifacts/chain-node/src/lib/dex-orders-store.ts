/**
 * File-backed EmberDelta orderbook for chain-node (duckdns).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ethers } from "ethers";
import { getBaseProvider } from "./base-provider";

const DATA_FILE =
  (process.env.DEX_ORDERS_DATA_FILE ?? "").trim() || "./data/dex-orders.json";

export interface DexOrder {
  hash: string;
  token_get: string;
  amount_get: string;
  token_give: string;
  amount_give: string;
  expires: string;
  nonce: string;
  maker: string;
  v: number;
  r: string;
  s: string;
  status: "open" | "filled" | "cancelled";
  created_at: string;
}

interface DexOrdersData {
  orders: Record<string, DexOrder>;
}

const EMBER_DELTA_ADDRESS = (
  process.env.EMBER_DELTA_ADDRESS ?? "0x365f70E546e3D4D35745e7C91Cf189956E2fBEFA"
).toLowerCase();

const TRADE_TOPIC = ethers.id(
  "Trade(address,uint256,address,uint256,address,address,bytes32)",
);

let cache: DexOrdersData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadData(): DexOrdersData {
  if (cache) return cache;
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    cache = { ...defaultData(), ...(JSON.parse(raw) as DexOrdersData) };
  } catch {
    cache = { orders: {} };
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
    console.error("[dex-orders-store] save failed:", (err as Error).message);
  }
}

export async function insertOrder(order: Omit<DexOrder, "status" | "created_at">): Promise<void> {
  const data = loadData();
  const hash = order.hash.toLowerCase();
  if (data.orders[hash]) return;

  data.orders[hash] = {
    hash: order.hash,
    token_get: order.token_get.toLowerCase(),
    amount_get: order.amount_get,
    token_give: order.token_give.toLowerCase(),
    amount_give: order.amount_give,
    expires: order.expires,
    nonce: order.nonce,
    maker: order.maker.toLowerCase(),
    v: order.v,
    r: order.r,
    s: order.s,
    status: "open",
    created_at: new Date().toISOString(),
  };
  scheduleSave();
}

export async function listOrders(token?: string, status = "open"): Promise<DexOrder[]> {
  const data = loadData();
  let rows = Object.values(data.orders).filter((o) => o.status === status);
  if (token) {
    const t = token.toLowerCase();
    rows = rows.filter((o) => o.token_get === t || o.token_give === t);
  }
  return rows
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200);
}

export async function getOrder(hash: string): Promise<DexOrder | null> {
  return loadData().orders[hash.toLowerCase()] ?? null;
}

export async function updateOrderStatus(
  hash: string,
  status: "filled" | "cancelled",
): Promise<"ok" | "not_found" | "conflict"> {
  const data = loadData();
  const key = hash.toLowerCase();
  const order = data.orders[key];
  if (!order) return "not_found";
  if (order.status !== "open") return "conflict";
  order.status = status;
  scheduleSave();
  return "ok";
}

export async function getOrdersETag(token?: string, status = "open"): Promise<string> {
  const rows = await listOrders(token, status);
  const ts = rows[0]?.created_at ?? "empty";
  return `"${status}-${rows.length}-${ts}"`;
}

export async function verifyTradeOnChain(
  txHash: string,
  orderHash: string,
): Promise<string | null> {
  const provider = getBaseProvider();
  if (!provider) {
    if (process.env.NODE_ENV === "development") return null;
    return "BASE_RPC_URL is not configured — cannot verify on-chain settlement";
  }

  let receipt: ethers.TransactionReceipt | null;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (err) {
    return `Could not fetch tx receipt: ${(err as Error).message}`;
  }

  if (!receipt) return "Transaction not found on Base — it may still be pending";
  if (receipt.status !== 1) return "Transaction reverted on-chain";

  const normalizedOrder = orderHash.toLowerCase();
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== EMBER_DELTA_ADDRESS ||
      log.topics[0] !== TRADE_TOPIC
    ) {
      continue;
    }

    const raw = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    if (raw.length < 256) continue;
    const loggedOrderHash = `0x${raw.slice(192, 256)}`;
    if (loggedOrderHash.toLowerCase() === normalizedOrder) return null;
  }

  return "No matching Trade event found in tx — the transaction did not settle this order";
}
