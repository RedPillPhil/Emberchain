import React, { useMemo, useEffect } from 'react';
import { formatNumber } from '@/lib/utils';
import { parseTradeLogs } from '@/lib/parse-trades';
import type { TradeLogEntry } from '@/pages/Exchange';

interface TradeRow {
  id: string;
  time: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  total: number;
}

interface TradeHistoryProps {
  tokenAddress: `0x${string}`;
  symbol: string;
  onLastPrice?: (price: number) => void;
  tradeLogs: TradeLogEntry[];
}

export const TradeHistory = React.memo(function TradeHistory({
  tokenAddress,
  symbol,
  onLastPrice,
  tradeLogs,
}: TradeHistoryProps) {
  const trades = useMemo<TradeRow[]>(() => {
    const parsed = parseTradeLogs(tradeLogs, tokenAddress);
    return parsed
      .sort((a, b) => {
        const blockCmp = a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0;
        if (blockCmp !== 0) return blockCmp;
        return b.logIndex - a.logIndex;
      })
      .map((t) => ({
        id: t.id,
        time: `#${t.blockNumber.toString()}`,
        side: t.side,
        price: t.price,
        amount: t.amount,
        total: t.total,
      }));
  }, [tradeLogs, tokenAddress]);

  useEffect(() => {
    if (trades.length > 0 && onLastPrice) {
      onLastPrice(trades[0].price);
    }
  }, [trades, onLastPrice]);

  const loading = tradeLogs.length === 0 && trades.length === 0;

  return (
    <div className="flex flex-col h-full bg-card font-mono text-xs overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-border font-sans font-semibold text-muted-foreground uppercase text-[10px] tracking-wider shrink-0 bg-card z-10">
        <span>Trade History</span>
        {loading && <span className="text-[9px] animate-pulse">loading…</span>}
      </div>

      <div className="flex p-2 text-muted-foreground border-b border-border/50 shrink-0 pr-4">
        <div className="w-1/4">Block</div>
        <div className="w-1/4">Price (ETH)</div>
        <div className="w-1/4 text-right">Amount</div>
        <div className="w-1/4 text-right">Total</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loading && trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <p className="text-muted-foreground font-sans text-[11px]">
              No {symbol}/ETH trades yet on-chain.
            </p>
            <p className="text-muted-foreground/60 font-sans text-[10px]">
              Completed trades appear here in real time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {trades.map((trade) => (
              <div key={trade.id} className="flex px-2 py-1 hover:bg-white/5 h-6 items-center">
                <div className="w-1/4 text-muted-foreground truncate">{trade.time}</div>
                <div className={`w-1/4 ${trade.side === 'buy' ? 'text-bid' : 'text-ask'}`}>
                  {formatNumber(trade.price, 6)}
                </div>
                <div className="w-1/4 text-right text-white/80">{formatNumber(trade.amount, 4)}</div>
                <div className="w-1/4 text-right text-white/50">{formatNumber(trade.total, 6)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
