import { formatEther } from "viem";
import { ETH_ADDR } from "@/lib/contracts";
import type { TradeLogEntry } from "@/pages/Exchange";

export interface ParsedTrade {
  id: string;
  blockNumber: bigint;
  logIndex: number;
  side: "buy" | "sell";
  price: number;
  amount: number;
  total: number;
  maker: string;
  taker: string;
  transactionHash: string;
}

export interface TradeChartPoint {
  time: string;
  close: number;
  closeEth: number;
  volume: number;
  block: string;
}

/** Parse EmberDelta Trade logs into wTOKEN/ETH prices. */
export function parseTradeLogs(
  tradeLogs: TradeLogEntry[],
  tokenAddress: string,
): ParsedTrade[] {
  const rows: ParsedTrade[] = [];
  const token = tokenAddress.toLowerCase();
  const eth = ETH_ADDR.toLowerCase();

  for (const log of tradeLogs) {
    const { tokenGet, amountGet, tokenGive, amountGive } = log.args;
    if (!tokenGet || !amountGet || !tokenGive || !amountGive) continue;

    const tg = tokenGet.toLowerCase();
    const tv = tokenGive.toLowerCase();
    if (tg !== token && tv !== token) continue;

    let side: "buy" | "sell";
    let ethAmt: bigint;
    let tokenAmt: bigint;

    if (tg === eth && tv === token) {
      side = "sell";
      ethAmt = amountGet;
      tokenAmt = amountGive;
    } else if (tg === token && tv === eth) {
      side = "buy";
      tokenAmt = amountGet;
      ethAmt = amountGive;
    } else {
      continue;
    }

    const tokenFloat = parseFloat(formatEther(tokenAmt));
    const ethFloat = parseFloat(formatEther(ethAmt));
    // Partial fills can be tiny — don't drop sub-wei amounts due to float rounding.
    if (tokenAmt <= 0n || ethAmt <= 0n) continue;

    const price = ethFloat / tokenFloat;

    rows.push({
      id: `${log.transactionHash ?? "0x"}-${log.logIndex ?? 0}-${log.args.orderHash ?? ""}`,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      side,
      price,
      amount: tokenFloat,
      total: ethFloat,
      maker: log.args.maker ?? "",
      taker: log.args.taker ?? "",
      transactionHash: log.transactionHash ?? "",
    });
  }

  return rows;
}

/** Chronological chart points from parsed trades (oldest → newest). */
export function tradesToChartPoints(
  trades: ParsedTrade[],
  ethUsd?: number | null,
): TradeChartPoint[] {
  const sorted = [...trades].sort((a, b) => {
    const blockCmp = a.blockNumber > b.blockNumber ? 1 : a.blockNumber < b.blockNumber ? -1 : 0;
    if (blockCmp !== 0) return blockCmp;
    return a.logIndex - b.logIndex;
  });

  return sorted.map((t, i) => ({
    time: sorted.length <= 5 ? `#${t.blockNumber}` : `${i + 1}`,
    close: ethUsd ? t.price * ethUsd : t.price,
    closeEth: t.price,
    volume: t.amount,
    block: t.blockNumber.toString(),
  }));
}

export function chartPriceDomain(prices: number[]): [number, number] {
  if (prices.length === 0) return [0, 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) {
    const pad = min > 0 ? min * 0.02 : 0.000001;
    return [Math.max(0, min - pad), max + pad];
  }
  const pad = (max - min) * 0.08;
  return [Math.max(0, min - pad), max + pad];
}
