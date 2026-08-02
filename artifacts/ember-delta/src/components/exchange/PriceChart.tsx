import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber, formatUsd, cn } from '@/lib/utils';
import { chartPriceDomain, parseTradeLogs, tradesToChartPoints } from '@/lib/parse-trades';
import { useEthUsdPrice } from '@/lib/eth-usd';
import type { TradeLogEntry } from '@/pages/Exchange';

type PriceCurrency = 'eth' | 'usd';
type ChartStyle = 'line' | 'bar';

interface ChartProps {
  symbol: string;
  tokenAddress: `0x${string}`;
  tradeLogs: TradeLogEntry[];
  /** Fallback header price when there are no trades yet. */
  currentPrice: number;
}

function ChartToggle({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-sans">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-2 py-0.5 transition-colors',
            value === opt.value
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-white/5',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PriceChart({ symbol, tokenAddress, tradeLogs, currentPrice }: ChartProps) {
  const ethUsd = useEthUsdPrice();
  const [currency, setCurrency] = useState<PriceCurrency>('eth');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('line');

  const trades = useMemo(
    () => parseTradeLogs(tradeLogs, tokenAddress),
    [tradeLogs, tokenAddress],
  );

  const chartData = useMemo(() => {
    const ethUsdForChart = currency === 'usd' ? ethUsd : null;
    const points = tradesToChartPoints(trades, ethUsdForChart);
    if (points.length === 1) {
      return [
        { ...points[0], time: '1' },
        { ...points[0], time: '2' },
      ];
    }
    return points;
  }, [trades, currency, ethUsd]);

  const latestTrade = trades.length > 0
    ? trades.reduce((latest, t) =>
        t.blockNumber > latest.blockNumber ||
        (t.blockNumber === latest.blockNumber && t.logIndex > latest.logIndex)
          ? t
          : latest,
      trades[0])
    : null;

  const displayPriceEth = latestTrade?.price ?? currentPrice;
  const displayPriceUsd = ethUsd ? displayPriceEth * ethUsd : null;

  const yDomain = useMemo(
    () => chartPriceDomain(chartData.map((d) => d.close)),
    [chartData],
  );

  const isUp = chartData.length >= 2
    ? chartData[chartData.length - 1].close >= chartData[0].close
    : true;
  const color = isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  const hasTrades = trades.length > 0;

  const yTickFormatter = (val: number) =>
    currency === 'usd' ? formatUsd(val) : formatNumber(val, 6);

  const tooltipContent = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof chartData[0] }> }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const priceEth = row.closeEth;
    const priceUsd = ethUsd ? priceEth * ethUsd : null;

    return (
      <div className="bg-popover border border-border p-2 rounded shadow-xl text-xs font-mono">
        {row.block && (
          <div className="text-muted-foreground mb-1">Block {row.block}</div>
        )}
        <div className="text-white">
          Price: {formatNumber(priceEth, 6)} ETH
          {priceUsd != null && (
            <span className="text-muted-foreground"> ({formatUsd(priceUsd)})</span>
          )}
        </div>
        <div className="text-muted-foreground mt-1">
          Size: {formatNumber(row.volume, 4)} {symbol}
        </div>
      </div>
    );
  };

  const sharedAxes = (
    <>
      <XAxis dataKey="time" hide />
      <YAxis
        domain={yDomain}
        orientation="right"
        tickFormatter={yTickFormatter}
        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
        axisLine={false}
        tickLine={false}
        width={currency === 'usd' ? 64 : 72}
      />
      <Tooltip content={tooltipContent} />
    </>
  );

  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      <div className="flex items-center justify-between p-2 border-b border-border shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="font-bold text-lg text-white shrink-0">
            {symbol}/{currency === 'usd' ? 'USD' : 'ETH'}
          </div>
          <div className="flex flex-col min-w-0">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-bid' : 'text-ask'}`}>
              {displayPriceEth > 0 ? (
                currency === 'usd' && displayPriceUsd != null
                  ? formatUsd(displayPriceUsd)
                  : formatNumber(displayPriceEth, 6)
              ) : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {displayPriceEth > 0 && currency === 'eth' && displayPriceUsd != null && (
                <>{formatUsd(displayPriceUsd)} · </>
              )}
              {displayPriceEth > 0 && currency === 'usd' && (
                <>{formatNumber(displayPriceEth, 6)} ETH · </>
              )}
              {hasTrades
                ? `${trades.length} on-chain trade${trades.length === 1 ? '' : 's'}`
                : 'No trades yet'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ChartToggle
            value={currency}
            options={[
              { value: 'eth', label: 'ETH' },
              { value: 'usd', label: 'USD' },
            ]}
            onChange={(v) => setCurrency(v as PriceCurrency)}
          />
          <ChartToggle
            value={chartStyle}
            options={[
              { value: 'line', label: 'Line' },
              { value: 'bar', label: 'Bar' },
            ]}
            onChange={(v) => setChartStyle(v as ChartStyle)}
          />
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
        ) : chartStyle === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              {sharedAxes}
              <Bar
                dataKey="close"
                fill={color}
                fillOpacity={0.75}
                isAnimationActive={false}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              {sharedAxes}
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
