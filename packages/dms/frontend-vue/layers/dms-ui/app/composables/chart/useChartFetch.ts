import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  appendPeriodToUrl,
  usePeriodScope,
} from "../../../../dms-core/app/composables/period/usePeriodScope";
import type { PeriodState } from "../../../../dms-core/app/composables/period/types";
import { useRealtimeTopic } from "../../../../dms-core/app/composables/realtime/useRealtimeTopic";
import {
  hasUrlVariables,
  resolveUrlVariables,
} from "../../build/utils/urlVariables";
import { onPageBlocksRefresh } from "../../utils/blockRefresh";

export interface UseChartFetchOptions<T> {
  /**
   * Where the data is read from. `{{params.X}}` is filled from `routeParams`
   * and `{{query.X}}` from the page URL's query, again when they change;
   * nothing is requested while a token is left without a value.
   */
  fetchUrl?: string;
  /** The parameters of the page route (a block's `routeParams` prop). */
  routeParams?: () => Record<string, string> | undefined;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  watchSource?: () => unknown;
  staticData?: T | null | (() => T | null);
}

export interface UseChartFetchReturn<T> {
  data: Ref<T | null>;
  /**
   * A response for the current inputs is still to come: from the first paint
   * until the first answer, and again from the moment the inputs change
   * (period, watched state, realtime event) until the new answer lands.
   */
  isLoading: Ref<boolean>;
  error: Ref<unknown>;
  refresh: () => Promise<void>;
}

const DEBOUNCE_FRAME_MS = 180;
const DEFAULT_HTTP_METHOD = "GET";
// How long a card waits for its period scope to register before it stops
// claiming to load. The selector registers the scope from its own lazily
// loaded chunk, which on a slow network lands seconds after the card mounts:
// a short grace would drop the card to its empty state ("No data") while the
// scope is merely late. Only a scope no selector ever registers reaches it.
export const PENDING_SCOPE_TIMEOUT_MS = 10_000;

function buildFinalUrl(
  url: string | undefined,
  scopeState: PeriodState | null,
  scope: string | undefined,
): string | undefined {
  if (!url) return url;
  if (!scope) return url;
  return appendPeriodToUrl(url, scopeState);
}

/** What one fetch requests. */
interface FetchRequest {
  url: string | undefined;
  method: string | undefined;
  periodScope: string | undefined;
}

interface FetchRunner {
  hasFetchedOnce: boolean;
  /** Inputs the last fetch was started for, to collapse duplicate triggers. */
  lastInputs: string | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  activeAbort: AbortController | null;
}

type AuthFetcher = <T>(
  url: string,
  opts: { method: string; signal: AbortSignal },
) => Promise<T>;

async function runFetch<T>(
  authFetch: AuthFetcher,
  request: FetchRequest,
  scopeState: PeriodState | null,
  runner: FetchRunner,
  data: Ref<T | null>,
  isLoading: Ref<boolean>,
  error: Ref<unknown>,
): Promise<void> {
  if (!request.url) return;
  if (request.periodScope && !scopeState) return;
  const url = buildFinalUrl(request.url, scopeState, request.periodScope);
  if (!url) return;
  if (runner.activeAbort) runner.activeAbort.abort();
  const controller = new AbortController();
  runner.activeAbort = controller;
  isLoading.value = true;
  error.value = null;
  try {
    const response = await authFetch<T>(url, {
      method: request.method || DEFAULT_HTTP_METHOD,
      signal: controller.signal,
    });
    if (runner.activeAbort !== controller) return;
    data.value = response;
  } catch (err) {
    if (runner.activeAbort !== controller) return;
    if ((err as { name?: string })?.name !== "AbortError") error.value = err;
  } finally {
    // A request a newer one superseded leaves the loading flag to that one:
    // clearing it here would show the empty state while the newer answer is
    // still on its way.
    if (runner.activeAbort === controller) {
      runner.activeAbort = null;
      isLoading.value = false;
    }
  }
}

function readStaticData<T>(
  source: UseChartFetchOptions<T>["staticData"],
): T | null {
  if (typeof source === "function") return (source as () => T | null)();
  return source ?? null;
}

function subscribeRealtimeTopics(
  topic: string | string[] | undefined,
  onEvent: () => void,
): void {
  if (!topic) return;
  const topics = Array.isArray(topic) ? topic : [topic];
  for (const entry of topics) {
    useRealtimeTopic(entry, (event) => {
      if (!("type" in event)) return;
      onEvent();
    });
  }
}

/**
 * The URL to request: `fetchUrl` with its tokens filled, or `undefined` while
 * one has no value. Only a URL naming a token reads the route.
 */
function useResolvedFetchUrl<T>(
  options: UseChartFetchOptions<T>,
): ComputedRef<string | undefined> {
  const { fetchUrl } = options;
  if (!fetchUrl || !hasUrlVariables(fetchUrl)) return computed(() => fetchUrl);
  const route = useDmsRoute();
  return computed(() =>
    resolveUrlVariables(fetchUrl, {
      routeParams: options.routeParams?.(),
      routeQuery: route.query as Record<string, unknown>,
    }),
  );
}

// Mounted only: the page refresh is a browser event, and a block the server
// renders has nothing to refetch.
function subscribePageRefresh(onRefresh: () => void): void {
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = onPageBlocksRefresh(onRefresh);
  });
  onBeforeUnmount(() => unsubscribe?.());
}

export function useChartFetch<T>(
  options: UseChartFetchOptions<T>,
): UseChartFetchReturn<T> {
  const data = ref<T | null>(
    readStaticData(options.staticData),
  ) as Ref<T | null>;
  // A card that fetches has nothing to show until its first response lands.
  // SSR cannot help: registerPeriodScope() is a client-only no-op, so a
  // period-scoped card renders server-side with no scope and no data. Start
  // in the loading state so consumers show a skeleton instead of a hard zero
  // for the whole hydrate-then-fetch window.
  const resolvedUrl = useResolvedFetchUrl(options);
  const isLoading = ref(Boolean(resolvedUrl.value));
  const error = ref<unknown>(null);
  const scopeState = usePeriodScope(options.periodScope);
  const { $authFetch } = useAuthFetch();
  const runner: FetchRunner = {
    hasFetchedOnce: false,
    lastInputs: null,
    pendingTimer: null,
    activeAbort: null,
  };

  const performFetch = () =>
    runFetch(
      $authFetch as AuthFetcher,
      {
        url: resolvedUrl.value,
        method: options.fetchUrlMethod,
        periodScope: options.periodScope,
      },
      scopeState.value,
      runner,
      data,
      isLoading,
      error,
    );

  const refresh = async () => {
    if (runner.pendingTimer) clearTimeout(runner.pendingTimer);
    runner.pendingTimer = null;
    await performFetch();
  };

  const currentInputs = () =>
    `${resolvedUrl.value}|${scopeState.value?.key ?? ""}|${JSON.stringify(options.watchSource?.() ?? null)}`;

  const fetchScheduledInputs = () => {
    runner.pendingTimer = null;
    runner.lastInputs = currentInputs();
    void performFetch();
  };

  // A debounced refresh the inputs took back (a period changed and changed
  // back) leaves nothing to wait for unless a request is still running.
  const settleCancelledRefresh = (hadPending: boolean) => {
    if (hadPending && !runner.activeAbort) isLoading.value = false;
  };

  // A period scope registers during the PeriodSelector's setup, which lands
  // before or after a card's own mount depending on which chunk resolves
  // first. Either way both the watcher and onMounted end up looking at the
  // same freshly registered scope and each ask for a refresh; keying on the
  // inputs the last fetch was started for collapses that into one request.
  const scheduleRefreshWith = (announcePending: boolean) => {
    const hadPending = runner.pendingTimer !== null;
    if (runner.pendingTimer) clearTimeout(runner.pendingTimer);
    runner.pendingTimer = null;
    if (!resolvedUrl.value || (options.periodScope && !scopeState.value)) {
      settleCancelledRefresh(hadPending);
      return;
    }
    const inputs = currentInputs();
    if (inputs === runner.lastInputs) {
      settleCancelledRefresh(hadPending);
      return;
    }
    if (!runner.hasFetchedOnce) {
      runner.hasFetchedOnce = true;
      fetchScheduledInputs();
      return;
    }
    // The values on screen belong to the previous inputs from now on: say so
    // through the debounce as well, not only once the request leaves.
    if (announcePending) isLoading.value = true;
    runner.pendingTimer = setTimeout(fetchScheduledInputs, DEBOUNCE_FRAME_MS);
  };
  const scheduleRefresh = () => scheduleRefreshWith(true);

  // A realtime event or a page refresh (refreshPageBlocks) means the data
  // behind unchanged inputs moved, so it has to bypass the deduplication
  // above. The inputs did not change, so the values on screen stay current
  // until the new answer replaces them.
  const refreshSameInputs = () => {
    runner.lastInputs = null;
    scheduleRefreshWith(false);
  };

  const fetchOnMount = () => {
    scheduleRefresh();
    if (runner.hasFetchedOnce) return;
    // The scope has not registered yet, and may never. Keep the skeleton
    // while its selector may still be loading, then drop the loading state
    // so a misconfigured scope shows its empty value rather than a skeleton
    // that never resolves.
    setTimeout(() => {
      if (!runner.hasFetchedOnce) isLoading.value = false;
    }, PENDING_SCOPE_TIMEOUT_MS);
  };

  if (options.fetchUrl) {
    watch(
      () => [resolvedUrl.value, scopeState.value?.key, options.watchSource?.()],
      scheduleRefresh,
    );
    onMounted(fetchOnMount);
    subscribeRealtimeTopics(options.realtimeTopic, refreshSameInputs);
    subscribePageRefresh(refreshSameInputs);
  } else if (typeof options.staticData === "function") {
    watch(
      () => readStaticData(options.staticData),
      (next) => {
        data.value = next;
      },
    );
  }

  return { data, isLoading, error, refresh };
}
