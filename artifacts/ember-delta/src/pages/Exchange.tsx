import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Shell } from '@/components/layout/Shell';
import { OrderBook } from '@/components/exchange/OrderBook';
import { PriceChart } from '@/components/exchange/PriceChart';
import { TradeHistory } from '@/components/exchange/TradeHistory';
import { OrderForm } from '@/components/exchange/OrderForm';
import { BUILT_IN_PAIRS, getAllPairs, addCustomPair, type TradingPair } from '@/lib/custom-pairs';
import { usePublicClient } from 'wagmi';
import { parseAbi } from 'viem';
import { EMBER_DELTA_ADDRESS, BASE_CHAIN_ID, ERC20_ABI } from '@/lib/contracts';
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

const TRADE_ABI = parseAbi([
  'event Trade(address indexed tokenGet, uint256 amountGet, address indexed tokenGive, uint256 amountGive, address indexed taker, address maker, bytes32 orderHash)',
]);

// ── Shared hook: one eth_getLogs per 15 s, paused when tab is hidden ──────
function useSharedTradeData(tokenAddress: `0x${string}`) {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n);
  const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([]);

  const fetchLogs = useCallback(async () => {
    if (!publicClient) return;
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > 9000n ? latest - 9000n : 0n;
      const logs = await publicClient.getLogs({
        address: EMBER_DELTA_ADDRESS,
        event: TRADE_ABI[0],
        fromBlock,
        toBlock: 'latest',
      });
      setCurrentBlock(latest);
      setTradeLogs(logs as TradeLogEntry[]);
    } catch {
      /* silent — keep stale data */
    }
  }, [publicClient]);

  useEffect(() => {
    if (!publicClient) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId) return;
      fetchLogs();
      intervalId = setInterval(fetchLogs, 15_000);
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
  }, [publicClient, fetchLogs]);

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
          />
        </div>

        {/* Center: Chart + Trade History */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <div className="h-[60%] shrink-0">
            <PriceChart symbol={selectedPair.symbol} currentPrice={lastPrice} />
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
          <OrderForm pair={selectedPair} onOrdersChanged={bumpOrders} />
        </div>
      </div>

      {/* ── MOBILE: scrollable single-column stack ── */}
      <div className="lg:hidden h-full overflow-y-auto bg-background flex flex-col">

        {/* 1. Compact price chart */}
        <div className="h-[220px] shrink-0 border-b border-border">
          <PriceChart symbol={selectedPair.symbol} currentPrice={lastPrice} />
        </div>

        {/* 2. Order form — flows to natural height */}
        <div className="border-b border-border shrink-0">
          <OrderForm
            pair={selectedPair}
            className="h-auto border-l-0"
            onOrdersChanged={bumpOrders}
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
