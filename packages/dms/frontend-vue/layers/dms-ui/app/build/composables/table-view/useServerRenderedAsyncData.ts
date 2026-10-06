/**
 * Async data a list renders from: awaited during the server render, so the
 * markup carries the rows (and hydration reuses them), but never awaited in
 * the browser, so a client navigation paints the list chrome and its skeleton
 * right away instead of holding the page's Suspense until the fetch returns.
 *
 * Callers still `await` the result: on the server it is the fetch, in the
 * browser an already settled value. Read the loading state from the returned
 * `data` (`null` until the first result) rather than from `status`, which
 * stays `idle` until the deferred fetch starts.
 *
 * @param key Async data key (shared with the hydration payload)
 * @param handler Fetches the data
 * @param options `useDmsAsyncData` options (`watch`, `transform`…)
 */
export function useServerRenderedAsyncData<T>(
  key: string,
  handler: () => Promise<T>,
  options: Parameters<typeof useDmsAsyncData<T>>[2] = {},
): Promise<Awaited<ReturnType<typeof useDmsAsyncData<T>>>> {
  if (import.meta.env.SSR) return useDmsAsyncData<T>(key, handler, options);
  return Promise.resolve(useDmsLazyAsyncData<T>(key, handler, options));
}
