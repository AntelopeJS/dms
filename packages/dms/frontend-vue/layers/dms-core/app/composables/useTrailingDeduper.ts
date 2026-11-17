const dedupersByApp = new WeakMap<object, Map<string, TrailingDeduper>>();

/**
 * A {@link createTrailingDeduper} scoped to the current DMS app: one instance
 * per client session, and one per request while server-rendering, so a trailing
 * pass never runs in the continuation of another request's promise — where the
 * state it writes, and the DMS app context its task needs, belong to someone else.
 *
 * Kept per app instance rather than in `useDmsState`, which only carries
 * serializable payload.
 */
export function useTrailingDeduper(name: string): TrailingDeduper {
  const app = useDmsApp();
  let dedupers = dedupersByApp.get(app);
  if (!dedupers) {
    dedupers = new Map();
    dedupersByApp.set(app, dedupers);
  }
  const existing = dedupers.get(name);
  if (existing) return existing;
  const deduper = createTrailingDeduper();
  dedupers.set(name, deduper);
  return deduper;
}
