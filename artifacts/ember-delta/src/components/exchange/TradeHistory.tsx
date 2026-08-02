import React, { useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { usePublicClient } from 'wagmi';
import { formatNumber, formatUsd, shortAddress } from '@/lib/utils';
import { parseTradeLogs } from '@/lib/parse-trades';
import { useEthUsdPrice } from '@/lib/eth-usd';
import { useBlockTimestamps } from '@/lib/use-block-timestamps';
import { BASE_CHAIN_ID } from '@/lib/contracts';
import type { TradeLogEntry } from '@/pages/Exchange';

interface TradeRow {
  id: string;
  timeLabel: string;
  maker: string;
  taker: string;
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
  const ethUsd = useEthUsdPrice();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });

  const parsed = useMemo(
    () => parseTradeLogs(tradeLogs, tokenAddress),
    [tradeLogs, tokenAddress],
  );

  const blockNumbers = useMemo(
    () => parsed.map((t) => t.blockNumber),
    [parsed],
  );
  const blockTimestamps = useBlockTimestamps(blockNumbers, publicClient);

  const trades = useMemo<TradeRow[]>(() => {
    return parsed
      .sort((a, b) => {
        const blockCmp = a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0;
        if (blockCmp !== 0) return blockCmp;
        return b.logIndex - a.logIndex;
      })
      .map((t) => {
        const ts = blockTimestamps.get(t.blockNumber.toString());
        const timeLabel = ts
          ? format(new Date(ts * 1000), 'M/d/yy h:mm a')
          : `#${t.blockNumber.toString()}`;

        return {
          id: t.id,
          timeLabel,
          maker: t.maker,
          taker: t.taker,
          side: t.side,
          price: t.price,
          amount: t.amount,
          total: t.total,
        };
      });
  }, [parsed, blockTimestamps]);

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
        <div className="flex items-center gap-2 normal-case tracking-normal">
          {ethUsd != null && (
            <span className="text-[9px] text-muted-foreground/80">
              ETH {formatUsd(ethUsd)}
            </span>
          )}
          {loading && <span className="text-[9px] animate-pulse">loading…</span>}
        </div>
      </div>

      <div className="overflow-x-auto shrink-0 border-b border-border/50">
        <div className="flex p-2 text-muted-foreground min-w-[640px] pr-4">
          <div className="w-[110px] shrink-0">Time</div>
          <div className="w-[72px] shrink-0">Maker</div>
          <div className="w-[72px] shrink-0">Taker</div>
          <div className="w-[150px] shrink-0">Price (ETH / USD)</div>
          <div className="w-[80px] shrink-0 text-right">Amount</div>
          <div className="flex-1 min-w-[120px] text-right">Total</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto">
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
          <div className="flex flex-col min-w-[640px]">
            {trades.map((trade) => {
              const priceUsd = ethUsd ? trade.price * ethUsd : null;
              const totalUsd = ethUsd ? trade.total * ethUsd : null;

              return (
                <div
                  key={trade.id}
                  className="flex px-2 py-1.5 hover:bg-white/5 min-h-[28px] items-center border-b border-border/20"
                >
                  <div className="w-[110px] shrink-0 text-muted-foreground truncate text-[10px]">
                    {trade.timeLabel}
                  </div>
                  <div
                    className="w-[72px] shrink-0 text-white/60 truncate text-[10px]"
                    title={trade.maker}
                  >
                    {shortAddress(trade.maker)}
                  </div>
                  <div
                    className="w-[72px] shrink-0 text-white/60 truncate text-[10px]"
                    title={trade.taker}
                  >
                    {shortAddress(trade.taker)}
                  </div>
                  <div className={`w-[150px] shrink-0 text-[10px] ${trade.side === 'buy' ? 'text-bid' : 'text-ask'}`}>
                    {formatNumber(trade.price, 6)}
                    {priceUsd != null && (
                      <span className="text-white/50 ml-1">
                        ({formatUsd(priceUsd)})
                      </span>
                    )}
                  </div>
                  <div className="w-[80px] shrink-0 text-right text-white/80 text-[10px]">
                    {formatNumber(trade.amount, 4)}
                  </div>
                  <div className="flex-1 min-w-[120px] text-right text-white/50 text-[10px]">
                    {formatNumber(trade.total, 4)}
                    {totalUsd != null && (
                      <span className="text-white/40 ml-1">
                        ({formatUsd(totalUsd)})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
