import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { formatNumber, cn } from '@/lib/utils';
import { API } from '@/lib/api';
import { useWriteContract, useAccount } from 'wagmi';
import { formatEther, parseAbi } from 'viem';
import {
  EMBER_DELTA_ADDRESS,
  EMBER_DELTA_ABI,
  ETH_ADDR,
  BASE_CHAIN_ID,
} from '@/lib/contracts';
import type { TradeLogEntry } from '@/pages/Exchange';

interface OpenOrder {
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
  side: 'buy' | 'sell';  // from the taker's perspective: 'sell' = maker is selling token
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  tokenAddress: `0x${string}`;
  symbol: string;
  className?: string;
  /** Pre-fetched Trade event logs from Exchange (shared — no duplicate RPC call). */
  tradeLogs: TradeLogEntry[];
  /** Current block from Exchange's shared fetch — used to filter expired orders. */
  currentBlock: bigint;
}

export const OrderBook = React.memo(function OrderBook({
  tokenAddress,
  symbol,
  className,
  tradeLogs,
  currentBlock,
}: OrderBookProps) {
  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fillingHash, setFillingHash] = useState<string | null>(null);
  const [fillToast, setFillToast] = useState<{ msg: string; err: boolean } | null>(null);

  const showFillToast = (msg: string, err = false) => {
    setFillToast({ msg, err });
    setTimeout(() => setFillToast(null), err ? 8000 : 5000);
  };

  // ── Derive last traded price from shared trade logs ───────────────────
  const lastPrice = useMemo<number | null>(() => {
    const rows: { price: number; blockNumber: bigint }[] = [];
    for (const log of tradeLogs) {
      const { tokenGet, amountGet, tokenGive, amountGive } = log.args;
      if (!tokenGet || !amountGet || !tokenGive || !amountGive) continue;
      const tg = tokenGet.toLowerCase(), tv = tokenGive.toLowerCase();
      const ta = tokenAddress.toLowerCase(), ea = ETH_ADDR.toLowerCase();
      let ethAmt: bigint, tokenAmt: bigint;
      if (tg === ea && tv === ta) { ethAmt = amountGet; tokenAmt = amountGive; }
      else if (tg === ta && tv === ea) { tokenAmt = amountGet; ethAmt = amountGive; }
      else continue;
      const tf = parseFloat(formatEther(tokenAmt)), ef = parseFloat(formatEther(ethAmt));
      rows.push({ price: tf > 0 ? ef / tf : 0, blockNumber: log.blockNumber ?? 0n });
    }
    rows.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    return rows[0]?.price ?? null;
  }, [tradeLogs, tokenAddress]);

  // ── Fetch off-chain orderbook from api-server ─────────────────────────
  // Paused automatically when tab is hidden to save RPC slots.
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/dex/orders?token=${tokenAddress}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      const raw: any[] = await res.json();

      const parsed: OpenOrder[] = [];
      for (const o of raw) {
        // Filter out expired orders client-side using the shared currentBlock
        if (currentBlock > 0n && BigInt(o.expires) < currentBlock) continue;

        const tg = o.token_get.toLowerCase();
        const tv = o.token_give.toLowerCase();
        const ethAddr = ETH_ADDR.toLowerCase();
        const ta = tokenAddress.toLowerCase();

        let side: 'buy' | 'sell';
        let price: number;
        let amountFloat: number;
        let totalFloat: number;

        if (tg === ethAddr && tv === ta) {
          side = 'sell';
          amountFloat = parseFloat(formatEther(BigInt(o.amount_give)));
          totalFloat  = parseFloat(formatEther(BigInt(o.amount_get)));
          price = amountFloat > 0 ? totalFloat / amountFloat : 0;
        } else if (tg === ta && tv === ethAddr) {
          side = 'buy';
          amountFloat = parseFloat(formatEther(BigInt(o.amount_get)));
          totalFloat  = parseFloat(formatEther(BigInt(o.amount_give)));
          price = amountFloat > 0 ? totalFloat / amountFloat : 0;
        } else {
          continue;
        }

        parsed.push({ ...o, side, price, amount: amountFloat, total: totalFloat });
      }

      setOpenOrders(parsed);
    } catch (e) {
      console.error('OrderBook fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress, currentBlock]);

  // Poll the off-chain orderbook, paused when tab is hidden
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      fetchOrders();
      intervalId = setInterval(fetchOrders, 15_000);
    };
    const stop = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    const handleVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', handleVisibility);

    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchOrders]);

  // ── Fill an order (taker calls trade()) ──────────────────────────────────
  const fillOrder = async (order: OpenOrder) => {
    if (!address) { showFillToast('Connect wallet to fill orders', true); return; }
    if (chainId !== BASE_CHAIN_ID) { showFillToast('Switch to Base to fill orders', true); return; }

    setFillingHash(order.hash);
    showFillToast('Check MetaMask — confirm the fill transaction…');

    try {
      const amount = BigInt(order.amount_get);

      const txHash = await writeContractAsync({
        address: EMBER_DELTA_ADDRESS,
        abi: EMBER_DELTA_ABI,
        functionName: 'trade',
        args: [
          order.token_get as `0x${string}`,
          BigInt(order.amount_get),
          order.token_give as `0x${string}`,
          BigInt(order.amount_give),
          BigInt(order.expires),
          BigInt(order.nonce),
          order.maker as `0x${string}`,
          order.v,
          order.r as `0x${string}`,
          order.s as `0x${string}`,
          amount,
        ],
      });

      // Mark as filled in the orderbook — supply the on-chain tx hash as proof
      await fetch(`${API}/api/dex/orders/${order.hash}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      }).catch(() => {});

      showFillToast(`Order filled — tx: ${txHash.slice(0, 10)}…`);
      setOpenOrders(prev => prev.filter(o => o.hash !== order.hash));
    } catch (e: any) {
      if (e?.message?.includes('rejected') || e?.message?.includes('denied') || e?.code === 4001) {
        showFillToast('Rejected', true);
      } else {
        showFillToast(`Fill failed: ${e?.shortMessage ?? e?.message ?? 'unknown error'}`, true);
      }
    } finally {
      setFillingHash(null);
    }
  };

  const asks = openOrders.filter(o => o.side === 'sell').sort((a, b) => b.price - a.price).slice(0, 15);
  const bids = openOrders.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price).slice(0, 15);
  const maxTotal = Math.max(...[...asks, ...bids].map(t => t.total), 0.0001) * 1.5;
  const isEmpty = openOrders.length === 0;

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border text-xs font-mono", className)}>
      <div className="flex items-center justify-between p-2 border-b border-border font-sans font-semibold text-muted-foreground uppercase text-[10px] tracking-wider shrink-0">
        <span>Order Book</span>
        {loading && <span className="text-[9px] text-muted-foreground animate-pulse">loading…</span>}
      </div>

      {/* Headers */}
      <div className="flex p-2 text-muted-foreground border-b border-border/50 shrink-0 pr-4">
        <div className="w-1/3">Price(ETH)</div>
        <div className="w-1/3 text-right">{symbol}</div>
        <div className="w-1/3 text-right">Total(ETH)</div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <span className="text-lg">📖</span>
            </div>
            <div className="text-muted-foreground text-[11px] leading-relaxed font-sans">
              <p className="font-semibold text-white/60 mb-1">No open orders</p>
              <p>Place the first order to start the book. Orders are signed off-chain, settled on-chain.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Asks */}
            <div className="flex flex-col justify-end min-h-[40%]">
              {asks.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px] font-sans">No asks</div>
              ) : asks.map((ask) => {
                const depthPerc = Math.min(100, (ask.total / maxTotal) * 100);
                const isMine = address && ask.maker.toLowerCase() === address.toLowerCase();
                const filling = fillingHash === ask.hash;
                return (
                  <div
                    key={ask.hash}
                    onClick={() => !isMine && !filling && fillOrder(ask)}
                    className={cn(
                      "flex px-2 py-0.5 hover-bg-ask cursor-pointer relative h-6 items-center group",
                      isMine && "opacity-60 cursor-default",
                      filling && "animate-pulse"
                    )}
                    title={isMine ? "Your order" : "Click to fill this sell order"}
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-destructive/10 z-0 pointer-events-none" style={{ width: `${depthPerc}%` }} />
                    <div className="w-1/3 text-ask z-10">{formatNumber(ask.price, 6)}</div>
                    <div className="w-1/3 text-right z-10 text-white/80">{formatNumber(ask.amount, 2)}</div>
                    <div className="w-1/3 text-right z-10 text-white/50">
                      {isMine
                        ? <span className="text-[9px] text-muted-foreground">yours</span>
                        : filling
                        ? <span className="text-[9px] text-primary">filling…</span>
                        : formatNumber(ask.total, 4)
                      }
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Spread indicator */}
            <div className="sticky top-0 bottom-0 z-20 flex items-center justify-center p-2 bg-background border-y border-border my-0.5 font-sans font-bold text-sm shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className="text-bid">{lastPrice ? formatNumber(lastPrice, 6) : '—'}</span>
              <span className="ml-2 text-muted-foreground text-xs font-normal font-mono">last trade</span>
            </div>

            {/* Bids */}
            <div className="flex flex-col justify-start min-h-[40%]">
              {bids.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px] font-sans">No bids</div>
              ) : bids.map((bid) => {
                const depthPerc = Math.min(100, (bid.total / maxTotal) * 100);
                const isMine = address && bid.maker.toLowerCase() === address.toLowerCase();
                const filling = fillingHash === bid.hash;
                return (
                  <div
                    key={bid.hash}
                    onClick={() => !isMine && !filling && fillOrder(bid)}
                    className={cn(
                      "flex px-2 py-0.5 hover-bg-bid cursor-pointer relative h-6 items-center group",
                      isMine && "opacity-60 cursor-default",
                      filling && "animate-pulse"
                    )}
                    title={isMine ? "Your order" : "Click to fill this buy order"}
                  >
                    <div className="absolute right-0 top-0 bottom-0 bg-success/10 z-0 pointer-events-none" style={{ width: `${depthPerc}%` }} />
                    <div className="w-1/3 text-bid z-10">{formatNumber(bid.price, 6)}</div>
                    <div className="w-1/3 text-right z-10 text-white/80">{formatNumber(bid.amount, 2)}</div>
                    <div className="w-1/3 text-right z-10 text-white/50">
                      {isMine
                        ? <span className="text-[9px] text-muted-foreground">yours</span>
                        : filling
                        ? <span className="text-[9px] text-primary">filling…</span>
                        : formatNumber(bid.total, 4)
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Fill toast */}
      {fillToast && (
        <div className={cn(
          "fixed bottom-4 left-4 border-l-4 p-3 shadow-2xl z-50 text-xs font-medium max-w-xs",
          fillToast.err ? "bg-card border-destructive text-destructive" : "bg-card border-primary"
        )}>
          {fillToast.msg}
        </div>
      )}
    </div>
  );
});
