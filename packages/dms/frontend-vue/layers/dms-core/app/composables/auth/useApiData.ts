import type {
  DmsAsyncDataKey,
  DmsAsyncDataResult,
  UseAsyncDataOptions,
  UseFetchOptions,
} from "#dms/frontend-module";
import type { MaybeRefOrGetter } from "vue";

/** The authenticated fetch `useAuthFetch` returns. */
type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** What a handler loading API data receives. */
export interface ApiDataContext {
  /** `useAuthFetch`'s fetch: the session retry, the language and realtime headers. */
  $authFetch: AuthFetch;
  /** Aborted once the result is no longer wanted: pass it to each request. */
  signal: AbortSignal;
}

export type ApiDataHandler<T> = (context: ApiDataContext) => Promise<T>;

/** `useDmsFetch`'s options, the fetch function aside: it is `$authFetch`. */
export type UseApiDataOptions<T> = Omit<UseFetchOptions<T>, "$fetch">;

/** A backend URL to read, or nothing to read while it is null or undefined. */
export type ApiDataRequest = MaybeRefOrGetter<string | null | undefined>;

/**
 * What `useApiData` returns: `data`, `status`, `pending`, `error`, the `key`
 * the data is loaded under, `placeholder` (a reactive request still showing
 * the previous answer), `execute()`, `refresh()` and `clear()`. Usable at
 * once, or awaited until the data is there.
 */
export type ApiDataResult<T> = DmsAsyncDataResult<T>;

/**
 * Reads backend data for a component: the one way a module loads what it
 * renders. A server render waits for it and hands it to the browser with the
 * page, which then does not ask again; the callers of one request share it.
 * Data read before shows at once and is read again in the background on each
 * mount (stale while revalidate).
 *
 * - `useApiData(url, options)` reads one URL, like Nuxt's `useFetch`. The URL,
 *   `method`, `query`, `params` and `body` may be refs or getters, read again
 *   for each request: the data follows them. A URL that is null or undefined
 *   reads nothing until it has a value.
 * - `useApiData(key, handler, options)` loads what the handler returns, like
 *   Nuxt's `useAsyncData`: for data made of several requests. The handler
 *   receives `$authFetch` and the `signal` to pass to each request.
 *
 * Requests go through `$authFetch` (session retry, language and realtime
 * headers), and the data is kept per account and workspace: a switch of
 * either reads it again. The options are the renderer's:
 *
 * - `lazy` spares a client navigation the wait; `server: false` leaves the
 *   data to the browser (for what only the browser knows).
 * - `immediate: false` waits for `execute()`: a dialog or a drawer reads
 *   what it shows once it opens.
 * - `refreshInterval: ms` reads again on an interval while a component shows
 *   the data and the page is visible: polling.
 * - The page's refreshes (`refreshPageBlocks()`) and the events of its
 *   realtime topics read the data again; `refreshOnPageRefresh: false` opts
 *   out, for data with refresh triggers of its own.
 * - `data` is a shallow ref: replace the value to change it, or pass
 *   `deep: true`.
 *
 * A write stays an `$authFetch` call; once it is done, the page's refresh
 * reads what changed.
 */
export function useApiData<T>(
  url: ApiDataRequest,
  options?: UseApiDataOptions<T>,
): ApiDataResult<T>;
export function useApiData<T>(
  key: MaybeRefOrGetter<DmsAsyncDataKey>,
  handler: ApiDataHandler<T>,
  options?: UseAsyncDataOptions<T>,
): ApiDataResult<T>;
export function useApiData<T>(
  source: ApiDataRequest,
  handlerOrOptions?: ApiDataHandler<T> | UseApiDataOptions<T>,
  options?: UseAsyncDataOptions<T>,
): ApiDataResult<T> {
  const { $authFetch } = useAuthFetch();
  if (typeof handlerOrOptions === "function")
    return useDmsAsyncData<T>(
      source,
      ({ signal }) => handlerOrOptions({ $authFetch, signal }),
      options,
    );
  return useDmsFetch<T>(source, {
    ...handlerOrOptions,
    $fetch: $authFetch as UseFetchOptions<T>["$fetch"],
  });
}
