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

/** Thrown when the taker has insufficient DEX deposit to fill an order. */
export class InsufficientDexDepositError extends Error {
  readonly asset: string;
  readonly deposited: string;
  readonly required: string;
  readonly action: "buy" | "sell";

  constructor(opts: {
    asset: string;
    deposited: string;
    required: string;
    action: "buy" | "sell";
  }) {
    super(
      `Deposit more ${opts.asset} to ${opts.action === "buy" ? "buy" : "sell"}. ` +
        `You have ${opts.deposited} ${opts.asset} in the DEX but need ~${opts.required} ${opts.asset} (incl. fee).`,
    );
    this.name = "InsufficientDexDepositError";
    this.asset = opts.asset;
    this.deposited = opts.deposited;
    this.required = opts.required;
    this.action = opts.action;
  }
}

export interface PreparedFill {
  amount: bigint;
  summary: string;
}

function assetLabel(order: ParsedOpenOrder, pairSymbol: string): string {
  return order.token_get.toLowerCase() === ETH_ADDR.toLowerCase() ? "ETH" : pairSymbol;
}

function capFillAmount(
  available: bigint,
  feeBps: bigint,
  takerBalance: bigint,
  requested: bigint,
): bigint {
  const maxByBalance = takerBalance * 10000n / (10000n + feeBps);
  let amount = requested < available ? requested : available;
  if (amount > maxByBalance) amount = maxByBalance;
  return amount;
}

async function readFillContext(
  client: PublicClient,
  order: ParsedOpenOrder,
  taker: `0x${string}`,
) {
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

  return { available, feeBps, takerBalance, v, r, s };
}

export async function prepareOrderFillWithAmount(
  client: PublicClient,
  order: ParsedOpenOrder,
  taker: `0x${string}`,
  pairSymbol: string,
  requestedAmountGet: bigint,
): Promise<PreparedFill> {
  if (requestedAmountGet <= 0n) {
    throw new Error("Fill amount must be greater than zero.");
  }

  const { available, feeBps, takerBalance, v, r, s } = await readFillContext(client, order, taker);
  const action: "buy" | "sell" = order.side === "sell" ? "buy" : "sell";
  const asset = assetLabel(order, pairSymbol);

  if (available === 0n) {
    throw new Error(
      "This order can no longer be filled — it may be expired, cancelled, already filled, or the maker no longer has enough deposited.",
    );
  }

  const amount = capFillAmount(available, feeBps, takerBalance, requestedAmountGet);

  if (amount === 0n) {
    const requiredWithFee = requestedAmountGet + (requestedAmountGet * feeBps) / 10000n;
    throw new InsufficientDexDepositError({
      asset,
      deposited: formatEther(takerBalance),
      required: formatEther(requiredWithFee),
      action,
    });
  }

  const isPartial = amount < available;
  const summary = isPartial
    ? `Partial fill: ${formatEther(amount)} ${asset} (+ fee)`
    : `Full fill: ${formatEther(amount)} ${asset} (+ fee)`;

  await client.simulateContract({
    address: EMBER_DELTA_ADDRESS,
    abi: EMBER_DELTA_ABI,
    functionName: "trade",
    args: tradeArgs(order, amount),
    account: taker,
  });

  return { amount, summary };
}

export async function prepareOrderFill(
  client: PublicClient,
  order: ParsedOpenOrder,
  taker: `0x${string}`,
  pairSymbol: string,
): Promise<PreparedFill> {
  const { available, feeBps, takerBalance } = await readFillContext(client, order, taker);
  const requested = capFillAmount(available, feeBps, takerBalance, available);
  return prepareOrderFillWithAmount(client, order, taker, pairSymbol, requested);
}

export function isInsufficientDexDeposit(err: unknown): err is InsufficientDexDepositError {
  return err instanceof InsufficientDexDepositError;
}

export function explainTradeError(err: unknown): string {
  if (isInsufficientDexDeposit(err)) return err.message;

  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "shortMessage" in err
        ? String((err as { shortMessage?: string }).shortMessage)
        : String(err);

  if (/user rejected|denied|4001/i.test(msg)) return "Transaction rejected";

  if (/insufficient tokenget/i.test(msg)) {
    return "Not enough deposited in the DEX (includes protocol fee). Use Deposit / Withdraw in the order panel first.";
  }
  if (/insufficient tokengive/i.test(msg)) {
    return "Maker no longer has enough deposited to fill this order.";
  }
  if (/invalid signature/i.test(msg)) return "Order signature invalid — it may be corrupted in the order book.";
  if (/order expired/i.test(msg)) return "This order has expired.";
  if (/order cancelled/i.test(msg)) return "This order was cancelled.";
  if (/overfill/i.test(msg)) return "Order was already partially or fully filled on-chain.";
  if (/no longer be filled/i.test(msg)) return msg;

  return msg.length > 120 ? `${msg.slice(0, 120)}…` : msg;
}
