import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { OrderBook } from '@/components/exchange/OrderBook';
import { PriceChart } from '@/components/exchange/PriceChart';
import { TradeHistory } from '@/components/exchange/TradeHistory';
import { OrderForm } from '@/components/exchange/OrderForm';
import { BUILT_IN_PAIRS, getAllPairs, addCustomPair, type TradingPair } from '@/lib/custom-pairs';
import type { ParsedOpenOrder } from '@/lib/dex-orders';
import { usePublicClient } from 'wagmi';
import { chainNodeApi } from '@/lib/config';
import { BASE_CHAIN_ID, ERC20_ABI } from '@/lib/contracts';
import { DEX_TRADES_LOOKBACK, useSlowPoll } from '@/lib/dex-poll';
import { useSearch } from 'wouter';

// ── Shared Trade-event types ──────────────────────────────────────────────
export interface TradeLogEntry {
  args: {
    tokenGet?: `0x${string}`;
    amountGet?: bigint;
    tokenGive?: `0x${string}`;
    amountGive?: bigint;
    taker?: `0x${string}`;
    maker?: `0x${string}`;
    orderHash?: `0x${string}`;
  };
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
}

interface DexTradeLogDto {
  tokenGet: string;
  amountGet: string;
  tokenGive: string;
  amountGive: string;
  taker: string;
  maker: string;
  orderHash: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

function dtoToTradeLogEntry(d: DexTradeLogDto): TradeLogEntry {
  return {
    args: {
      tokenGet: d.tokenGet as `0x${string}`,
      amountGet: BigInt(d.amountGet),
      tokenGive: d.tokenGive as `0x${string}`,
      amountGive: BigInt(d.amountGive),
      taker: d.taker as `0x${string}`,
      maker: d.maker as `0x${string}`,
      orderHash: d.orderHash as `0x${string}`,
    },
    blockNumber: BigInt(d.blockNumber),
    transactionHash: d.transactionHash as `0x${string}`,
    logIndex: d.logIndex,
  };
}

// ── Shared trade fetch — server-side Base scan (browser eth_getLogs is unreliable) ──────
function useSharedTradeData(_tokenAddress: `0x${string}`) {
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n);
  const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(
        chainNodeApi(`/api/dex/trades?lookback=${DEX_TRADES_LOOKBACK || 0}`),
      );
      if (!res.ok) return;
      const data = (await res.json()) as { headBlock?: number; logs?: DexTradeLogDto[] };
      setCurrentBlock(BigInt(data.headBlock ?? 0));
      setTradeLogs((data.logs ?? []).map(dtoToTradeLogEntry));
    } catch {
      /* silent — keep stale data */
    }
  }, []);

  useSlowPoll(fetchLogs);

  return { currentBlock, tradeLogs };
}

// ── Collapsible section (mobile layout) ──────────────────────────────────
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  innerClassName,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  innerClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/5 transition-colors"
      >
        {title}
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className={innerClassName}>{children}</div>}
    </div>
  );
}

export default function Exchange() {
  const search = useSearch();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });

  // Resolve initial pair from ?pair=0x... URL param (deep-link from Launch page)
  const [selectedPair, setSelectedPair] = useState<TradingPair>(() => {
    const params = new URLSearchParams(search);
    const pairAddr = params.get('pair')?.toLowerCase();
    if (pairAddr) {
      const known = getAllPairs().find(p => p.tokenAddress.toLowerCase() === pairAddr);
      if (known) return known;
      // Will be resolved async below
    }
    return BUILT_IN_PAIRS[0];
  });
  const [lastPrice, setLastPrice] = useState<number>(0);

  // When the ?pair= param references an unknown address, resolve it on-chain
  useEffect(() => {
    const params = new URLSearchParams(search);
    const pairAddr = params.get('pair') as `0x${string}` | null;
    if (!pairAddr || !publicClient) return;

    // Already selected
    if (selectedPair.tokenAddress.toLowerCase() === pairAddr.toLowerCase()) return;

    // Check if it's already in our known pairs list (may have loaded async via Shell)
    const known = getAllPairs().find(p => p.tokenAddress.toLowerCase() === pairAddr.toLowerCase());
    if (known) { setSelectedPair(known); return; }

    // Resolve symbol + name from the chain, then add to custom pairs and select it
    Promise.all([
      publicClient.readContract({ address: pairAddr, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => null),
      publicClient.readContract({ address: pairAddr, abi: ERC20_ABI, functionName: 'name' }).catch(() => null),
    ]).then(([symbol, name]) => {
      if (!symbol) return;
      const pair: TradingPair = {
        tokenAddress: pairAddr,
        symbol: symbol as string,
        name: (name as string | null) ?? (symbol as string),
      };
      addCustomPair(pair);
      setSelectedPair(pair);
    }).catch(() => { /* ignore */ });
  }, [search, publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single shared RPC fetch for Trade events — distributed to both OrderBook
  // and TradeHistory so they don't independently call eth_getLogs every cycle.
  const { currentBlock, tradeLogs } = useSharedTradeData(selectedPair.tokenAddress);

  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const bumpOrders = useCallback(() => setOrdersRefreshKey((k) => k + 1), []);

  const [fillSelection, setFillSelection] = useState<{ order: ParsedOpenOrder; key: number } | null>(null);
  const handleOrderSelect = useCallback((order: ParsedOpenOrder) => {
    setFillSelection({ order, key: Date.now() });
  }, []);
  const clearFillSelection = useCallback(() => setFillSelection(null), []);

  // Stable callback so OrderForm/TradeHistory don't re-render when price updates
  const handleLastPrice = useCallback((p: number) => setLastPrice(p), []);

  return (
    <Shell selectedPair={selectedPair} onPairChange={setSelectedPair}>

      {/* ── DESKTOP: fixed three-column layout ── */}
      <div className="hidden lg:flex h-full bg-background">
        {/* Left: Order Book */}
        <div className="w-[280px] h-full shrink-0 border-r border-border">
          <OrderBook
            tokenAddress={selectedPair.tokenAddress}
            symbol={selectedPair.symbol}
            tradeLogs={tradeLogs}
            currentBlock={currentBlock}
            refreshKey={ordersRefreshKey}
            selectedOrderHash={fillSelection?.order.hash ?? null}
            onOrderSelect={handleOrderSelect}
          />
        </div>

        {/* Center: Chart + Trade History */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <div className="h-[60%] shrink-0">
            <PriceChart
              symbol={selectedPair.symbol}
              tokenAddress={selectedPair.tokenAddress}
              tradeLogs={tradeLogs}
              currentPrice={lastPrice}
            />
          </div>
          <div className="flex-1 min-h-0">
            <TradeHistory
              tokenAddress={selectedPair.tokenAddress}
              symbol={selectedPair.symbol}
              onLastPrice={handleLastPrice}
              tradeLogs={tradeLogs}
            />
          </div>
        </div>

        {/* Right: Order Form */}
        <div className="w-[320px] shrink-0 h-full overflow-y-auto">
          <OrderForm
            pair={selectedPair}
            onOrdersChanged={bumpOrders}
            fillSelection={fillSelection}
            onClearFillSelection={clearFillSelection}
          />
        </div>
      </div>

      {/* ── MOBILE: scrollable single-column stack ── */}
      <div className="lg:hidden h-full overflow-y-auto bg-background flex flex-col">

        {/* 1. Compact price chart */}
        <div className="h-[220px] shrink-0 border-b border-border">
          <PriceChart
            symbol={selectedPair.symbol}
            tokenAddress={selectedPair.tokenAddress}
            tradeLogs={tradeLogs}
            currentPrice={lastPrice}
          />
        </div>

        {/* 2. Order form — flows to natural height */}
        <div className="border-b border-border shrink-0">
          <OrderForm
            pair={selectedPair}
            className="h-auto border-l-0"
            onOrdersChanged={bumpOrders}
            fillSelection={fillSelection}
            onClearFillSelection={clearFillSelection}
          />
        </div>

        {/* 3. Order Book — collapsible, fixed-height scrollable inner */}
        <CollapsibleSection
          title="Order Book"
          defaultOpen={true}
          innerClassName="h-[280px]"
        >
          <OrderBook
            tokenAddress={selectedPair.tokenAddress}
            symbol={selectedPair.symbol}
            className="border-r-0"
            tradeLogs={tradeLogs}
            currentBlock={currentBlock}
            refreshKey={ordersRefreshKey}
            selectedOrderHash={fillSelection?.order.hash ?? null}
            onOrderSelect={handleOrderSelect}
          />
        </CollapsibleSection>

        {/* 4. Trade History — collapsible, fixed-height scrollable inner */}
        <CollapsibleSection
          title="Trade History"
          defaultOpen={false}
          innerClassName="h-[260px]"
        >
          <TradeHistory
            tokenAddress={selectedPair.tokenAddress}
            symbol={selectedPair.symbol}
            onLastPrice={handleLastPrice}
            tradeLogs={tradeLogs}
          />
        </CollapsibleSection>

        {/* Bottom breathing room */}
        <div className="h-6 shrink-0" />
      </div>

    </Shell>
  );
}
