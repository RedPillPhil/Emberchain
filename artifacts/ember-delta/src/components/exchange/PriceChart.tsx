import React, { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '@/lib/utils';
import { chartPriceDomain, parseTradeLogs, tradesToChartPoints } from '@/lib/parse-trades';
import type { TradeLogEntry } from '@/pages/Exchange';

interface ChartProps {
  symbol: string;
  tokenAddress: `0x${string}`;
  tradeLogs: TradeLogEntry[];
  /** Fallback header price when there are no trades yet. */
  currentPrice: number;
}

export function PriceChart({ symbol, tokenAddress, tradeLogs, currentPrice }: ChartProps) {
  const trades = useMemo(
    () => parseTradeLogs(tradeLogs, tokenAddress),
    [tradeLogs, tokenAddress],
  );

  const chartData = useMemo(() => {
    const points = tradesToChartPoints(trades);
    if (points.length === 1) {
      return [
        { ...points[0], time: '1' },
        { ...points[0], time: '2' },
      ];
    }
    return points;
  }, [trades]);

  const displayPrice = trades.length > 0
    ? trades.reduce((latest, t) =>
        t.blockNumber > latest.blockNumber ||
        (t.blockNumber === latest.blockNumber && t.logIndex > latest.logIndex)
          ? t
          : latest,
      trades[0]).price
    : currentPrice;

  const yDomain = useMemo(
    () => chartPriceDomain(chartData.map((d) => d.close)),
    [chartData],
  );

  const isUp = chartData.length >= 2
    ? chartData[chartData.length - 1].close >= chartData[0].close
    : true;
  const color = isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  const hasTrades = trades.length > 0;

  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg text-white">{symbol}/ETH</div>
          <div className="flex flex-col">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-bid' : 'text-ask'}`}>
              {displayPrice > 0 ? formatNumber(displayPrice, 6) : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {hasTrades ? `${trades.length} on-chain trade${trades.length === 1 ? '' : 's'}` : 'No trades yet'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative min-h-[200px]">
        {!hasTrades ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <p className="text-muted-foreground text-sm font-sans">No trade history yet</p>
            <p className="text-muted-foreground/60 text-xs font-sans mt-1">
              The chart plots real fill prices from on-chain Trade events.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis
                domain={yDomain}
                orientation="right"
                tickFormatter={(val) => formatNumber(val, 6)}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload as { time: string; close: number; volume: number; block?: string };
                    return (
                      <div className="bg-popover border border-border p-2 rounded shadow-xl text-xs font-mono">
                        {row.block && (
                          <div className="text-muted-foreground mb-1">Block {row.block}</div>
                        )}
                        <div className="text-white">Price: {formatNumber(row.close, 6)} ETH</div>
                        <div className="text-muted-foreground mt-1">
                          Size: {formatNumber(row.volume, 4)} {symbol}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPrice)"
                isAnimationActive={false}
                dot={trades.length <= 3 ? { r: 3, fill: color } : false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
