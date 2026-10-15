import type {
  DmsAsyncDataKey,
  DmsAsyncDataResult,
  UseAsyncDataOptions,
  UseFetchOptions,
} from "#dms/frontend-module";
import type { MaybeRefOrGetter } from "vue";
import { followPageRefresh } from "../../build/composables/auth/pageRefreshReads";

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

/** What `useApiData` adds to the renderer's options, in both forms. */
export interface ApiDataRefreshOptions {
  /**
   * Reads again each time the page refreshes its blocks: an action of the
   * user (`refreshPageBlocks()`: the page header's buttons, a form once
   * saved) at once, and a refresh nobody asked for (`refreshLivePageBlocks()`)
   * through the page's Live / Pause gate, as the built-in blocks do. The
   * callers of one request read it once. Browser only, from setup to unmount.
   */
  refreshOnPageRefresh?: boolean;
}

/** `useDmsFetch`'s options, the fetch function aside: it is `$authFetch`. */
export type UseApiDataOptions<T> = Omit<UseFetchOptions<T>, "$fetch"> &
  ApiDataRefreshOptions;

/** `useDmsAsyncData`'s options, for the handler form. */
export type UseApiDataHandlerOptions<T> = UseAsyncDataOptions<T> &
  ApiDataRefreshOptions;

/**
 * What `useApiData` returns: `data`, `error`, `status`, `pending`,
 * `refresh()`, `execute()` and `clear()`, usable at once or awaited until the
 * data is there. The type a composable returning a read declares.
 */
export type ApiDataResult<T> = DmsAsyncDataResult<T>;

/** A backend URL to read, or nothing to read while it is null or undefined. */
export type ApiDataRequest = MaybeRefOrGetter<string | null | undefined>;

/**
 * Reads backend data for a component: the one way a module loads what it
 * renders. A server render waits for it and hands it to the browser with the
 * page, which then does not ask again; the callers of one request share it.
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
 * headers). `lazy` spares a client navigation the wait, `server: false`
 * leaves the data to the browser (for what only the browser knows), and
 * `immediate: false` waits for `execute()`, and `refreshOnPageRefresh` reads
 * again with the page's blocks. A mutation or a read on a click stays an
 * `$authFetch` call; `useDmsData(key)` puts its answer in the data in place
 * (the URL form names its key with `key`).
 */
export function useApiData<T>(
  url: ApiDataRequest,
  options?: UseApiDataOptions<T>,
): ApiDataResult<T>;
export function useApiData<T>(
  key: MaybeRefOrGetter<DmsAsyncDataKey>,
  handler: ApiDataHandler<T>,
  options?: UseApiDataHandlerOptions<T>,
): ApiDataResult<T>;
export function useApiData<T>(
  source: ApiDataRequest,
  handlerOrOptions?: ApiDataHandler<T> | UseApiDataOptions<T>,
  handlerOptions?: UseApiDataHandlerOptions<T>,
): ApiDataResult<T> {
  const { $authFetch } = useAuthFetch();
  if (typeof handlerOrOptions === "function") {
    const { refreshOnPageRefresh, ...options } = handlerOptions ?? {};
    return followingPage(
      useDmsAsyncData<T>(
        source,
        ({ signal }) => handlerOrOptions({ $authFetch, signal }),
        options,
      ),
      refreshOnPageRefresh,
    );
  }
  const { refreshOnPageRefresh, ...options } = handlerOrOptions ?? {};
  return followingPage(
    useDmsFetch<T>(source, {
      ...options,
      $fetch: $authFetch as UseFetchOptions<T>["$fetch"],
    }),
    refreshOnPageRefresh,
  );
}

/**
 * `result`, read again with the page's blocks when the caller asks it: each
 * caller follows the page, the first refresh reads and the others join it.
 * A read that never ran (`immediate: false` before `execute()`, a null URL)
 * stays as it is.
 */
function followingPage<T>(
  result: ApiDataResult<T>,
  refreshOnPageRefresh: boolean | undefined,
): ApiDataResult<T> {
  if (refreshOnPageRefresh)
    followPageRefresh(async () => {
      if (result.status.value === "idle") return;
      await result.refresh({ dedupe: "defer" });
    });
  return result;
}
