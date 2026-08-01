import type { PublicClient } from "viem";
import { formatEther } from "viem";
import { EMBER_DELTA_ABI, EMBER_DELTA_ADDRESS, ETH_ADDR } from "@/lib/contracts";
import { DEX_TOKENS_ABI } from "@/lib/dex-balances";
import type { ParsedOpenOrder } from "@/lib/dex-orders";

/** ecrecover expects v = 27 or 28; some signers/API stores 0/1. */
export function normalizeSignatureV(v: number): number {
  if (v === 0 || v === 1) return v + 27;
  return v;
}

function asBytes32(hex: string): `0x${string}` {
  const h = hex.startsWith("0x") ? hex : `0x${hex}`;
  return h as `0x${string}`;
}

export function tradeArgs(order: ParsedOpenOrder, amount: bigint) {
  return [
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
    amount,
  ] as const;
}

export interface PreparedFill {
  amount: bigint;
  /** Human-readable summary for UI */
  summary: string;
}

export async function prepareOrderFill(
  client: PublicClient,
  order: ParsedOpenOrder,
  taker: `0x${string}`,
): Promise<PreparedFill> {
  const v = normalizeSignatureV(order.v);
  const r = asBytes32(order.r);
  const s = asBytes32(order.s);

  const [available, feeBps, takerBalance] = await Promise.all([
    client.readContract({
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
        v,
        r,
        s,
      ],
    }) as Promise<bigint>,
    client.readContract({
      address: EMBER_DELTA_ADDRESS,
      abi: EMBER_DELTA_ABI,
      functionName: "feeBps",
    }) as Promise<bigint>,
    client.readContract({
      address: EMBER_DELTA_ADDRESS,
      abi: DEX_TOKENS_ABI,
      functionName: "tokens",
      args: [order.token_get as `0x${string}`, taker],
    }) as Promise<bigint>,
  ]);

  if (available === 0n) {
    throw new Error(
      "This order can no longer be filled — it may be expired, cancelled, already filled, or the maker no longer has enough deposited.",
    );
  }

  // Taker pays `amount + fee` in tokenGet; fee = amount * feeBps / 10_000
  const maxByBalance =
    takerBalance * 10000n / (10000n + feeBps);

  const amount = available < maxByBalance ? available : maxByBalance;

  if (amount === 0n) {
    const tokenLabel =
      order.token_get.toLowerCase() === ETH_ADDR.toLowerCase() ? "ETH" : "tokens";
    const need = formatEther(
      available + (available * feeBps) / 10000n,
    );
    throw new Error(
      `Insufficient ${tokenLabel} deposited in the DEX. You need ~${need} ${tokenLabel} deposited (includes ${Number(feeBps) / 100}% fee). Use Deposit / Withdraw in the order panel first — wallet balance cannot be used directly.`,
    );
  }

  const isPartial = amount < available;
  const tokenGetLabel =
    order.token_get.toLowerCase() === ETH_ADDR.toLowerCase() ? "ETH" : "token";
  const summary = isPartial
    ? `Partial fill: ${formatEther(amount)} ${tokenGetLabel} (+ fee)`
    : `Full fill: ${formatEther(amount)} ${tokenGetLabel} (+ fee)`;

  // Dry-run so MetaMask never opens on a reverting tx
  await client.simulateContract({
    address: EMBER_DELTA_ADDRESS,
    abi: EMBER_DELTA_ABI,
    functionName: "trade",
    args: tradeArgs(order, amount),
    account: taker,
  });

  return { amount, summary };
}

export function explainTradeError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "shortMessage" in err
        ? String((err as { shortMessage?: string }).shortMessage)
        : String(err);

  if (/user rejected|denied|4001/i.test(msg)) return "Transaction rejected";

  if (/insufficient tokenget/i.test(msg)) {
    return "Insufficient funds deposited in the DEX (includes protocol fee). Deposit first via the order panel.";
  }
  if (/insufficient tokengive/i.test(msg)) {
    return "Maker no longer has enough deposited to fill this order.";
  }
  if (/invalid signature/i.test(msg)) return "Order signature invalid — it may be corrupted in the order book.";
  if (/order expired/i.test(msg)) return "This order has expired.";
  if (/order cancelled/i.test(msg)) return "This order was cancelled.";
  if (/overfill/i.test(msg)) return "Order was already partially or fully filled on-chain.";
  if (/deposit first/i.test(msg) || /no longer be filled/i.test(msg)) return msg;

  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}
