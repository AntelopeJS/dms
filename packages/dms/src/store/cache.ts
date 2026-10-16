/** How long an answer is kept, and how long a failed lookup is. */
export interface CacheLifetimes {
  found: number;
  failed: number;
}

interface CachedValue<T> {
  fetchedAt: number;
  value: T | undefined;
}

/** Looks a value up once per lifetime, sharing a lookup already in flight. */
export interface LookupCache<T> {
  get(
    key: string,
    lookup: () => Promise<T | undefined>,
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
  return {
    get(key, lookup) {
      const cached = values.get(key);
      if (cached && isFresh(cached)) return Promise.resolve(cached.value);
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
    },
  };
}
