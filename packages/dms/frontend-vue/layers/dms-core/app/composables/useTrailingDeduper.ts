const DEDUPER_KEY_PREFIX = "$dmsTrailingDeduper:";

interface DeduperHost {
  [key: string]: unknown;
}

/**
 * A {@link createTrailingDeduper} scoped to the current DMS app: one instance
 * per client session, and one per request while server-rendering, so a trailing
 * pass never runs in the continuation of another request's promise — where the
 * state it writes, and the DMS app context its task needs, belong to someone else.
 *
 * Stored on the app instance rather than in `useDmsState`, which only carries
 * serializable payload.
 */
export function useTrailingDeduper(name: string): TrailingDeduper {
  const host = useDmsApp() as unknown as DeduperHost;
  const key = `${DEDUPER_KEY_PREFIX}${name}`;
  const existing = host[key] as TrailingDeduper | undefined;
  if (existing) return existing;
  const deduper = createTrailingDeduper();
  host[key] = deduper;
  return deduper;
}
