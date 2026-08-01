import { chainNodeApi } from "@/lib/config";
import { ETH_ADDR } from "@/lib/contracts";
import { formatEther } from "viem";

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

export async function fetchRawOpenOrders(tokenAddress: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(chainNodeApi(`/api/dex/orders?token=${tokenAddress}`));
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

/** ETH and token amounts reserved by the maker's open orders (wei as floats). */
export function computeReservedBalances(orders: ParsedOpenOrder[], maker: string) {
  const lower = maker.toLowerCase();
  let ethWei = 0n;
  let tokenWei = 0n;

  for (const o of orders) {
    if (o.maker.toLowerCase() !== lower) continue;
    if (o.side === "buy") ethWei += BigInt(o.amount_give);
    else tokenWei += BigInt(o.amount_give);
  }

  return {
    ethReserved: parseFloat(formatEther(ethWei)),
    tokenReserved: parseFloat(formatEther(tokenWei)),
  };
}
