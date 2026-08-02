import { useEffect } from "react";

/** Background refresh for DEX order book + trade history (avoid Base RPC rate limits). */
export const DEX_POLL_MS = 30_000;

/** Block lookback for trade history — 0 = full history from deploy (server default). */
export const DEX_TRADES_LOOKBACK = 0;

/**
 * Run `fn` once immediately, then every DEX_POLL_MS while the tab is visible.
 * Pauses the interval when the tab is hidden; runs once when it becomes visible again.
 */
export function useSlowPoll(fn: () => void | Promise<void>): void {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      void fn();
    };

    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(run, DEX_POLL_MS);
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        run();
        startInterval();
      }
    };

    run();
    if (!document.hidden) startInterval();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fn]);
}
