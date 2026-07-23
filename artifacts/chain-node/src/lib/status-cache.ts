/**
 * Lightweight in-memory TTL cache for the two hottest read endpoints:
 * GET /chain/status and GET /mining/status.
 *
 * These are polled by every open browser tab every few seconds, but the
 * underlying blockchain state changes at most once per block (~8 s).
 * Caching for 3 s cuts repeated work while still feeling live.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entry: CacheEntry<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  get(): T | null {
    if (!this.entry || Date.now() > this.entry.expiresAt) return null;
    return this.entry.value;
  }

  set(value: T): void {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  /** Immediately expire so the next request fetches fresh data. */
  invalidate(): void {
    this.entry = null;
  }
}

export const chainStatusCache  = new TtlCache<object>(3_000);
export const miningStatusCache = new TtlCache<object>(3_000);
