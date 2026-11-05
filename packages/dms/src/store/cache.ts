/** How long an answer is kept, and how long a failed lookup is. */
export interface CacheLifetimes {
  found: number;
  failed: number;
}

interface CachedValue<T> {
  fetchedAt: number;
  value: T | undefined;
}

/**
 * How a read treats the cached value:
 * - `cached` answers within the lifetime and otherwise waits for the source;
 * - `fresh` always waits for a new lookup;
 * - `stale` also answers an expired answer at once while a lookup in the
 *   background replaces it. An expired failed lookup still waits.
 */
export type Freshness = "cached" | "fresh" | "stale";

export interface LookupOptions {
  freshness?: Freshness;
}

/** Looks a value up once per lifetime, sharing a lookup already in flight. */
export interface LookupCache<T> {
  get(
    key: string,
    lookup: () => Promise<T | undefined>,
    options?: LookupOptions,
  ): Promise<T | undefined>;
}

/**
 * A cache for slow lookups (the npm registry, the interfaces registry): a
 * failed lookup, kept as undefined, expires sooner, since the source may only
 * have blinked.
 */
export function createLookupCache<T>(
  lifetimes: CacheLifetimes,
): LookupCache<T> {
  const values = new Map<string, CachedValue<T>>();
  const pending = new Map<string, Promise<T | undefined>>();
  const isFresh = (cached: CachedValue<T>): boolean =>
    Date.now() - cached.fetchedAt <
    (cached.value === undefined ? lifetimes.failed : lifetimes.found);
  const refresh = (
    key: string,
    lookup: () => Promise<T | undefined>,
  ): Promise<T | undefined> => {
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const run = lookup()
      .catch(() => undefined)
      .then((value) => {
        values.set(key, { fetchedAt: Date.now(), value });
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, run);
    return run;
  };
  return {
    get(key, lookup, { freshness = "cached" } = {}) {
      const cached = values.get(key);
      if (freshness === "fresh" || !cached) return refresh(key, lookup);
      if (isFresh(cached)) return Promise.resolve(cached.value);
      if (freshness === "cached" || cached.value === undefined) {
        return refresh(key, lookup);
      }
      refresh(key, lookup).catch(() => undefined);
      return Promise.resolve(cached.value);
    },
  };
}
