import React, { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { generateCandles } from '@/lib/mock-data';
import { formatNumber } from '@/lib/utils';

interface ChartProps {
  symbol: string;
  currentPrice: number;
}

export function PriceChart({ symbol, currentPrice }: ChartProps) {
  const data = useMemo(() => generateCandles(currentPrice, 100), [currentPrice]);
  
  const isUp = data[data.length - 1].close >= data[0].close;
  const color = isUp ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  
  return (
    <div className="flex flex-col h-full bg-card border-b border-border">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <div className="font-bold text-lg text-white">{symbol}/ETH</div>
          <div className="flex flex-col">
            <span className={`text-sm font-bold font-mono ${isUp ? 'text-bid' : 'text-ask'}`}>
              {formatNumber(currentPrice, 6)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">${formatNumber(currentPrice * 3500, 4)}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {['1H', '6H', '1D', '1W'].map(time => (
            <button 
              key={time} 
              className={`px-2 py-1 text-xs font-semibold rounded ${time === '1D' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}
            >
              {time}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart Area */}
      <div className="flex-1 w-full relative min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              hide 
            />
            <YAxis 
              domain={['dataMin', 'dataMax']} 
              orientation="right"
              tickFormatter={(val) => formatNumber(val, 6)}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover border border-border p-2 rounded shadow-xl text-xs font-mono">
                      <div className="text-muted-foreground mb-1">{payload[0].payload.time}</div>
                      <div className="text-white">Price: {formatNumber(payload[0].value as number, 6)}</div>
                      <div className="text-muted-foreground mt-1">Vol: {formatNumber(payload[0].payload.volume, 0)}</div>
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
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
