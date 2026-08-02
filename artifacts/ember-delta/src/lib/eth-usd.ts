import { useEffect, useState } from "react";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
const CACHE_MS = 60_000;
const POLL_MS = 60_000;

let cached: { price: number; at: number } | null = null;

export async function fetchEthUsdPrice(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;

  try {
    const res = await fetch(COINGECKO_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return cached?.price ?? null;
    const data = (await res.json()) as { ethereum?: { usd?: number } };
    const price = data.ethereum?.usd;
    if (typeof price === "number" && price > 0) {
      cached = { price, at: Date.now() };
      return price;
    }
  } catch {
    /* keep stale cache */
  }
  return cached?.price ?? null;
}

/** Live ETH/USD from CoinGecko, refreshed every 60s. */
export function useEthUsdPrice(): number | null {
  const [ethUsd, setEthUsd] = useState<number | null>(cached?.price ?? null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const price = await fetchEthUsdPrice();
      if (!cancelled && price != null) setEthUsd(price);
    };

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return ethUsd;
}
