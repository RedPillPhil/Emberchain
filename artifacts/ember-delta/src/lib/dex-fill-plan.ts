import type { PublicClient } from "viem";
import { parseEther } from "viem";
import type { ParsedOpenOrder } from "@/lib/dex-orders";
import { prepareOrderFillWithAmount } from "@/lib/dex-trade";

export interface FillStep {
  order: ParsedOpenOrder;
  /** Fill size in tokenGet units (argument to trade()). */
  tradeAmountGet: bigint;
  /** Human-readable token size for this leg (pair token units). */
  tokenLeg: number;
}

/** Plan buy fills against sell orders (walk asks from best/lowest price up to limit). */
export function planBuyFills(
  asks: ParsedOpenOrder[],
  tokenAmount: number,
  maxPrice: number,
): FillStep[] {
  if (tokenAmount <= 0 || maxPrice <= 0) return [];

  const sorted = [...asks]
    .filter((o) => o.side === "sell" && o.price > 0 && o.price <= maxPrice + 1e-12)
    .sort((a, b) => a.price - b.price);

  let remaining = tokenAmount;
  const steps: FillStep[] = [];

  for (const order of sorted) {
    if (remaining <= 1e-12) break;

    const takeTokens = Math.min(remaining, order.amount);
    if (takeTokens <= 0) continue;

    const amountGet = BigInt(order.amount_get);
    const amountGive = BigInt(order.amount_give);
    const tokenWei = parseEther(takeTokens.toFixed(18));
    const tradeAmountGet = (tokenWei * amountGet) / amountGive;
    if (tradeAmountGet === 0n) continue;

    steps.push({ order, tradeAmountGet, tokenLeg: takeTokens });
    remaining -= takeTokens;
  }

  return steps;
}

/** Plan sell fills against buy orders (walk bids from best/highest price down to limit). */
export function planSellFills(
  bids: ParsedOpenOrder[],
  tokenAmount: number,
  minPrice: number,
): FillStep[] {
  if (tokenAmount <= 0 || minPrice <= 0) return [];

  const sorted = [...bids]
    .filter((o) => o.side === "buy" && o.price >= minPrice - 1e-12)
    .sort((a, b) => b.price - a.price);

  let remaining = tokenAmount;
  const steps: FillStep[] = [];

  for (const order of sorted) {
    if (remaining <= 1e-12) break;

    const takeTokens = Math.min(remaining, order.amount);
    if (takeTokens <= 0) continue;

    const tradeAmountGet = parseEther(takeTokens.toFixed(18));
    if (tradeAmountGet === 0n) continue;

    steps.push({ order, tradeAmountGet, tokenLeg: takeTokens });
    remaining -= takeTokens;
  }

  return steps;
}

export function planFillsFromBook(
  openOrders: ParsedOpenOrder[],
  side: "buy" | "sell",
  tokenAmount: number,
  limitPrice: number,
): FillStep[] {
  if (side === "buy") {
    return planBuyFills(
      openOrders.filter((o) => o.side === "sell"),
      tokenAmount,
      limitPrice,
    );
  }
  return planSellFills(
    openOrders.filter((o) => o.side === "buy"),
    tokenAmount,
    limitPrice,
  );
}

export function fillPlanSummary(
  steps: FillStep[],
  side: "buy" | "sell",
  symbol: string,
): string {
  if (steps.length === 0) return "No matching orders";
  const tokens = steps.reduce((s, x) => s + x.tokenLeg, 0);
  const orders = steps.length;
  const verb = side === "buy" ? "Buy" : "Sell";
  return `${verb} ~${tokens.toFixed(4)} ${symbol} across ${orders} order${orders === 1 ? "" : "s"}`;
}

export async function validateFillPlan(
  client: PublicClient,
  steps: FillStep[],
  taker: `0x${string}`,
  symbol: string,
): Promise<void> {
  for (const step of steps) {
    await prepareOrderFillWithAmount(
      client,
      step.order,
      taker,
      symbol,
      step.tradeAmountGet,
    );
  }
}
