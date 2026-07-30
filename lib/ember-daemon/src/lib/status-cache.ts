/**
 * Lightweight in-memory TTL cache for the two hottest read endpoints.
 * Identical to chain-node's status-cache.ts.
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

  invalidate(): void {
    this.entry = null;
  }
}

export const chainStatusCache  = new TtlCache<object>(30_000);
export const miningStatusCache = new TtlCache<object>(30_000);
