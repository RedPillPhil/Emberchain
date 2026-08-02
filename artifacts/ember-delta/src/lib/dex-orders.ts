import { chainNodeApi } from "@/lib/config";
import { ETH_ADDR, EMBER_DELTA_ABI, EMBER_DELTA_ADDRESS } from "@/lib/contracts";
import { formatEther } from "viem";
import type { PublicClient } from "viem";

export interface ParsedOpenOrder {
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
  side: "buy" | "sell";
  price: number;
  amount: number;
  total: number;
  /** Remaining fillable size in tokenGet units (from on-chain availableVolume). */
  available_get?: string;
}

export function parseOpenOrders(
  raw: Record<string, unknown>[],
  tokenAddress: string,
  currentBlock: bigint,
): ParsedOpenOrder[] {
  const parsed: ParsedOpenOrder[] = [];
  const ta = tokenAddress.toLowerCase();
  const ethAddr = ETH_ADDR.toLowerCase();

  for (const o of raw) {
    if (currentBlock > 0n && BigInt(String(o.expires)) < currentBlock) continue;

    const tg = String(o.token_get).toLowerCase();
    const tv = String(o.token_give).toLowerCase();

    let side: "buy" | "sell";
    let price: number;
    let amountFloat: number;
    let totalFloat: number;

    if (tg === ethAddr && tv === ta) {
      side = "sell";
      amountFloat = parseFloat(formatEther(BigInt(String(o.amount_give))));
      totalFloat = parseFloat(formatEther(BigInt(String(o.amount_get))));
      price = amountFloat > 0 ? totalFloat / amountFloat : 0;
    } else if (tg === ta && tv === ethAddr) {
      side = "buy";
      amountFloat = parseFloat(formatEther(BigInt(String(o.amount_get))));
      totalFloat = parseFloat(formatEther(BigInt(String(o.amount_give))));
      price = amountFloat > 0 ? totalFloat / amountFloat : 0;
    } else {
      continue;
    }

    parsed.push({
      hash: String(o.hash),
      token_get: String(o.token_get),
      amount_get: String(o.amount_get),
      token_give: String(o.token_give),
      amount_give: String(o.amount_give),
      expires: String(o.expires),
      nonce: String(o.nonce),
      maker: String(o.maker),
      v: Number(o.v),
      r: String(o.r),
      s: String(o.s),
      side,
      price,
      amount: amountFloat,
      total: totalFloat,
    });
  }

  return parsed;
}

const inflightOrderFetches = new Map<string, Promise<Record<string, unknown>[]>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch open orders with in-flight dedupe and retry for transient proxy/server errors. */
export async function fetchRawOpenOrders(tokenAddress: string): Promise<Record<string, unknown>[]> {
  const url = chainNodeApi(`/api/dex/orders?token=${tokenAddress}&status=open`);
  const existing = inflightOrderFetches.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const maxAttempts = 4;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return (await res.json()) as Record<string, unknown>[];

        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new Error(`Failed to fetch orders (${res.status})`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryable =
          lastError.name === "TypeError" ||
          lastError.message.includes("Failed to fetch") ||
          lastError.message.includes("NetworkError") ||
          /\(5\d\d\)/.test(lastError.message);
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("Failed to fetch orders");
  })().finally(() => {
    inflightOrderFetches.delete(url);
  });

  inflightOrderFetches.set(url, promise);
  return promise;
}

function asBytes32(hex: string): `0x${string}` {
  const h = hex.startsWith("0x") ? hex : `0x${hex}`;
  return h as `0x${string}`;
}

function normalizeSignatureV(v: number): number {
  if (v === 0 || v === 1) return v + 27;
  return v;
}

/** Adjust display sizes from on-chain remaining volume; drop fully filled orders. */
export async function enrichOrdersWithChainVolume(
  client: PublicClient,
  orders: ParsedOpenOrder[],
): Promise<ParsedOpenOrder[]> {
  const enriched = await Promise.all(
    orders.map(async (order) => {
      try {
        const available = (await client.readContract({
          address: EMBER_DELTA_ADDRESS,
          abi: EMBER_DELTA_ABI,
          functionName: "availableVolume",
          args: [
            order.token_get as `0x${string}`,
            BigInt(order.amount_get),
            order.token_give as `0x${string}`,
            BigInt(order.amount_give),
            BigInt(order.expires),
            BigInt(order.nonce),
            order.maker as `0x${string}`,
            normalizeSignatureV(order.v),
            asBytes32(order.r),
            asBytes32(order.s),
          ],
        })) as bigint;

        if (available === 0n) return null;

        const amountGet = BigInt(order.amount_get);
        const amountGive = BigInt(order.amount_give);

        let amountFloat: number;
        let totalFloat: number;

        if (order.side === "sell") {
          const tokenRemaining = (available * amountGive) / amountGet;
          amountFloat = parseFloat(formatEther(tokenRemaining));
          totalFloat = parseFloat(formatEther(available));
        } else {
          amountFloat = parseFloat(formatEther(available));
          totalFloat = parseFloat(formatEther((available * amountGive) / amountGet));
        }

        const price = amountFloat > 0 ? totalFloat / amountFloat : order.price;

        return {
          ...order,
          amount: amountFloat,
          total: totalFloat,
          price,
          available_get: available.toString(),
        };
      } catch {
        return order;
      }
    }),
  );

  return enriched.filter((o): o is ParsedOpenOrder => o !== null);
}

/** ETH and token amounts reserved by the maker's open orders (wei as floats). */
export function computeReservedBalances(orders: ParsedOpenOrder[], maker: string) {
  const lower = maker.toLowerCase();
  let ethWei = 0n;
  let tokenWei = 0n;

  for (const o of orders) {
    if (o.maker.toLowerCase() !== lower) continue;

    const amountGet = BigInt(o.amount_get);
    const amountGive = BigInt(o.amount_give);

    if (o.available_get) {
      const available = BigInt(o.available_get);
      if (o.side === "buy") ethWei += (available * amountGive) / amountGet;
      else tokenWei += (available * amountGive) / amountGet;
      continue;
    }

    if (o.side === "buy") ethWei += amountGive;
    else tokenWei += amountGive;
  }

  return {
    ethReserved: parseFloat(formatEther(ethWei)),
    tokenReserved: parseFloat(formatEther(tokenWei)),
  };
}
