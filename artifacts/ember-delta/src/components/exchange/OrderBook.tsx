import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatNumber, cn } from '@/lib/utils';
import { useAccount, useSignMessage, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { Loader2, X, RefreshCw } from 'lucide-react';
import { chainNodeApi } from '@/lib/config';
import { ETH_ADDR, BASE_CHAIN_ID } from '@/lib/contracts';
import {
  parseOpenOrders,
  fetchRawOpenOrders,
  enrichOrdersWithChainVolume,
  type ParsedOpenOrder,
} from '@/lib/dex-orders';
import type { TradeLogEntry } from '@/pages/Exchange';

interface OrderBookProps {
  tokenAddress: `0x${string}`;
  symbol: string;
  className?: string;
  tradeLogs: TradeLogEntry[];
  currentBlock: bigint;
  refreshKey?: number;
  /** Highlight order selected for fill in the panel. */
  selectedOrderHash?: string | null;
  /** Clicking a row sends the order to the fill panel instead of MetaMask. */
  onOrderSelect?: (order: ParsedOpenOrder) => void;
}

function LoadingOrdersPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-[10px] font-sans font-medium uppercase tracking-wider">Loading orders…</span>
    </div>
  );
}

export const OrderBook = React.memo(function OrderBook({
  tokenAddress,
  symbol,
  className,
  tradeLogs,
  currentBlock,
  refreshKey = 0,
  selectedOrderHash,
  onOrderSelect,
}: OrderBookProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { signMessageAsync } = useSignMessage();

  const [openOrders, setOpenOrders] = useState<ParsedOpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);
  const [cancellingHash, setCancellingHash] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 10000 : 5000);
  };

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

  const fetchOrders = useCallback(async (opts?: { showLoading?: boolean }) => {
    const gen = ++fetchGenRef.current;
    if (opts?.showLoading !== false) setLoading(true);

    try {
      const raw = await fetchRawOpenOrders(tokenAddress);
      if (gen !== fetchGenRef.current) return;

      let block = currentBlock;
      if (block === 0n && publicClient) {
        block = await publicClient.getBlockNumber();
      }
      if (gen !== fetchGenRef.current) return;

      let parsed = parseOpenOrders(raw, tokenAddress, block);
      if (publicClient) {
        parsed = await enrichOrdersWithChainVolume(publicClient, parsed);
      }
      if (gen !== fetchGenRef.current) return;

      setOpenOrders(parsed);
      setFetchError(null);
    } catch (e) {
      if (gen !== fetchGenRef.current) return;
      console.error('OrderBook fetch error', e);
      setFetchError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [tokenAddress, currentBlock, publicClient]);

  useEffect(() => {
    setFetchError(null);
    setOpenOrders([]);
    fetchOrders();
  }, [fetchOrders, refreshKey]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(() => { void fetchOrders({ showLoading: false }); }, 15_000);
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

  const cancelOrder = async (order: ParsedOpenOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!address) { showToast('Connect wallet to cancel orders', true); return; }

    setCancellingHash(order.hash);
    showToast('Check MetaMask — sign the cancel message…');

    try {
      const cancelMessage = `EmberDelta cancel order: ${order.hash}`;
      const signature = await signMessageAsync({ message: cancelMessage });

      const res = await fetch(chainNodeApi(`/api/dex/orders/${order.hash}/cancel`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? 'Failed to cancel order');
      }

      showToast('Order cancelled');
      setOpenOrders(prev => prev.filter(o => o.hash !== order.hash));
    } catch (e: unknown) {
      const err = e as { message?: string; shortMessage?: string; code?: number };
      if (err?.message?.includes('rejected') || err?.message?.includes('denied') || err?.code === 4001) {
        showToast('Signature rejected', true);
      } else {
        showToast(`Cancel failed: ${err?.shortMessage ?? err?.message ?? 'unknown error'}`, true);
      }
    } finally {
      setCancellingHash(null);
    }
  };

  const handleOrderClick = (order: ParsedOpenOrder) => {
    if (!address) { showToast('Connect wallet to fill orders', true); return; }
    onOrderSelect?.(order);
  };

  const asks = openOrders.filter(o => o.side === 'sell').sort((a, b) => b.price - a.price).slice(0, 15);
  const bids = openOrders.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price).slice(0, 15);
  const maxTotal = Math.max(...[...asks, ...bids].map(t => t.total), 0.0001) * 1.5;
  const isEmpty = !loading && !fetchError && openOrders.length === 0;

  const renderOrderRow = (order: ParsedOpenOrder, side: 'ask' | 'bid') => {
    const depthPerc = Math.min(100, (order.total / maxTotal) * 100);
    const isMine = address && order.maker.toLowerCase() === address.toLowerCase();
    const cancelling = cancellingHash === order.hash;
    const isAsk = side === 'ask';
    const isSelected = selectedOrderHash === order.hash;

    return (
      <div
        key={order.hash}
        onClick={() => !isMine && !cancelling && handleOrderClick(order)}
        className={cn(
          "flex px-2 py-0.5 relative h-6 items-center group",
          isAsk ? "hover-bg-ask" : "hover-bg-bid",
          isMine ? "opacity-80 cursor-default" : "cursor-pointer",
          cancelling && "animate-pulse",
          isSelected && "ring-1 ring-inset ring-primary/60 bg-primary/5",
        )}
        title={isMine ? "Your order — click × to cancel" : `Click to fill from this ${isAsk ? 'sell' : 'buy'} order`}
      >
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 z-0 pointer-events-none",
            isAsk ? "bg-destructive/10" : "bg-success/10",
          )}
          style={{ width: `${depthPerc}%` }}
        />
        <div className={cn("w-1/3 z-10", isAsk ? "text-ask" : "text-bid")}>{formatNumber(order.price, 6)}</div>
        <div className="w-1/3 text-right z-10 text-white/80">{formatNumber(order.amount, 2)}</div>
        <div className="w-1/3 text-right z-10 text-white/50 flex items-center justify-end gap-1">
          {isMine ? (
            <>
              <span className="text-[9px] text-muted-foreground">yours</span>
              <button
                type="button"
                onClick={(e) => cancelOrder(order, e)}
                disabled={!!cancellingHash}
                className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Cancel order"
              >
                {cancelling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </>
          ) : (
            formatNumber(order.total, 4)
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full bg-card border-r border-border text-xs font-mono", className)}>
      <div className="flex items-center justify-between p-2 border-b border-border font-sans font-semibold text-muted-foreground uppercase text-[10px] tracking-wider shrink-0">
        <span>Order Book</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
      </div>

      <div className="flex p-2 text-muted-foreground border-b border-border/50 shrink-0 pr-4">
        <div className="w-1/3">Price(ETH)</div>
        <div className="w-1/3 text-right">{symbol}</div>
        <div className="w-1/3 text-right">Total(ETH)</div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {loading ? (
          <>
            <div className="flex flex-col justify-end min-h-[40%]">
              <LoadingOrdersPanel />
            </div>
            <div className="sticky top-0 bottom-0 z-20 flex items-center justify-center p-2 bg-background border-y border-border my-0.5 font-sans font-bold text-sm shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className="text-bid">{lastPrice ? formatNumber(lastPrice, 6) : '—'}</span>
              <span className="ml-2 text-muted-foreground text-xs font-normal font-mono">last trade</span>
            </div>
            <div className="flex flex-col justify-start min-h-[40%]">
              <LoadingOrdersPanel />
            </div>
          </>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <p className="text-destructive text-[11px] font-sans font-semibold">Could not load orders</p>
            <p className="text-muted-foreground text-[10px] leading-relaxed font-sans">{fetchError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); void fetchOrders(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase font-bold border border-border rounded hover:bg-white/5"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : isEmpty ? (
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
            <div className="flex flex-col justify-end min-h-[40%]">
              {asks.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px] font-sans">No asks</div>
              ) : asks.map((ask) => renderOrderRow(ask, 'ask'))}
            </div>

            <div className="sticky top-0 bottom-0 z-20 flex items-center justify-center p-2 bg-background border-y border-border my-0.5 font-sans font-bold text-sm shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              <span className="text-bid">{lastPrice ? formatNumber(lastPrice, 6) : '—'}</span>
              <span className="ml-2 text-muted-foreground text-xs font-normal font-mono">last trade</span>
            </div>

            <div className="flex flex-col justify-start min-h-[40%]">
              {bids.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px] font-sans">No bids</div>
              ) : bids.map((bid) => renderOrderRow(bid, 'bid'))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className={cn(
          "fixed bottom-4 left-4 border-l-4 p-3 shadow-2xl z-50 text-xs font-medium max-w-xs",
          toast.err ? "bg-card border-destructive text-destructive" : "bg-card border-primary"
        )}>
          {toast.msg}
        </div>
      )}
    </div>
  );
});
