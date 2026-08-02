import { useEffect, useRef, useState } from "react";
import type { PublicClient } from "viem";

/** Resolve Base block numbers → Unix timestamps (seconds). */
export function useBlockTimestamps(
  blockNumbers: bigint[],
  publicClient: PublicClient | undefined,
): Map<string, number> {
  const [timestamps, setTimestamps] = useState<Map<string, number>>(new Map());
  const cacheRef = useRef<Map<string, number>>(new Map());

  const blockKey = blockNumbers
    .map((b) => b.toString())
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .join(",");

  useEffect(() => {
    if (!publicClient || !blockKey) return;

    const needed = blockKey.split(",").filter((k) => !cacheRef.current.has(k));
    if (needed.length === 0) return;

    let cancelled = false;

    void (async () => {
      for (const key of needed) {
        if (cancelled) return;
        try {
          const block = await publicClient.getBlock({ blockNumber: BigInt(key) });
          cacheRef.current.set(key, Number(block.timestamp));
        } catch {
          /* skip failed block */
        }
      }
      if (!cancelled) {
        setTimestamps(new Map(cacheRef.current));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, blockKey]);

  return timestamps;
}
