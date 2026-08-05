// Custom trading pairs — persisted in localStorage
// The EmberDelta contract supports any ERC-20/ETH pair natively.

export type TradingPair = {
  tokenAddress: `0x${string}`;
  symbol: string;
  name: string;
  isBuiltIn?: boolean;
  /** Set for tokens officially listed via the Token Launch program — never deletable by users */
  isOfficial?: boolean;
};

const STORAGE_KEY = 'emberdelta_custom_pairs_v1';

export const BUILT_IN_PAIRS: TradingPair[] = [
  {
    tokenAddress: '0x9362587019Ea0e4ef90fbd981c615d4441D9D2c4',
    symbol: 'wEMBR',
    name: 'Wrapped Emberchain',
    isBuiltIn: true,
  },
];

export function getCustomPairs(): TradingPair[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TradingPair[]) : [];
  } catch {
    return [];
  }
}

export function getAllPairs(): TradingPair[] {
  return [...BUILT_IN_PAIRS, ...getCustomPairs()];
}

/** Load server-curated markets (built-in wEMBR + featured + live launches, minus delisted). */
export async function fetchDexMarkets(apiBase: string): Promise<TradingPair[]> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/token-launch/markets`);
    if (!res.ok) return getAllPairs();
    const rows = await res.json() as Array<{
      tokenAddress: string;
      symbol: string;
      name: string;
      source?: string;
    }>;
    return rows.map((r) => ({
      tokenAddress: r.tokenAddress as `0x${string}`,
      symbol: r.symbol,
      name: r.name,
      isBuiltIn: r.source === 'builtin',
      isOfficial: r.source !== undefined,
    }));
  } catch {
    return getAllPairs();
  }
}

/** @deprecated use fetchDexMarkets */
export async function getAllPairsWithFeatured(apiBase: string): Promise<TradingPair[]> {
  return fetchDexMarkets(apiBase);
}

export function addCustomPair(pair: TradingPair): void {
  const existing = getCustomPairs();
  const deduped = existing.filter(
    (p) => p.tokenAddress.toLowerCase() !== pair.tokenAddress.toLowerCase(),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...deduped, pair]));
}

export function removeCustomPair(tokenAddress: string): void {
  const existing = getCustomPairs();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      existing.filter(
        (p) => p.tokenAddress.toLowerCase() !== tokenAddress.toLowerCase(),
      ),
    ),
  );
}
