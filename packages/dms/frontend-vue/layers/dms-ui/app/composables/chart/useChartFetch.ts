import { onMounted, ref, watch, type Ref } from "vue";
import {
  appendPeriodToUrl,
  usePeriodScope,
} from "../../../../dms-core/app/composables/period/usePeriodScope";
import type { PeriodState } from "../../../../dms-core/app/composables/period/types";
import { useRealtimeTopic } from "../../../../dms-core/app/composables/realtime/useRealtimeTopic";

export interface UseChartFetchOptions<T> {
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  watchSource?: () => unknown;
  staticData?: T | null | (() => T | null);
}

export interface UseChartFetchReturn<T> {
  data: Ref<T | null>;
  isLoading: Ref<boolean>;
  error: Ref<unknown>;
  refresh: () => Promise<void>;
}

const DEBOUNCE_FRAME_MS = 180;
const DEFAULT_HTTP_METHOD = "GET";
// Matches usePeriodScope's own grace period before it warns about a missing
// scope: past it, a card whose scope never registered stops claiming to load.
const PENDING_SCOPE_GRACE_MS = 250;

function buildFinalUrl(
  url: string | undefined,
  scopeState: PeriodState | null,
  scope: string | undefined,
): string | undefined {
  if (!url) return url;
  if (!scope) return url;
  return appendPeriodToUrl(url, scopeState);
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
  options: UseChartFetchOptions<T>,
  scopeState: PeriodState | null,
  runner: FetchRunner,
  data: Ref<T | null>,
  isLoading: Ref<boolean>,
  error: Ref<unknown>,
): Promise<void> {
  if (!options.fetchUrl) return;
  if (options.periodScope && !scopeState) return;
  const url = buildFinalUrl(options.fetchUrl, scopeState, options.periodScope);
  if (!url) return;
  if (runner.activeAbort) runner.activeAbort.abort();
  runner.activeAbort = new AbortController();
  isLoading.value = true;
  error.value = null;
  try {
    data.value = await authFetch<T>(url, {
      method: options.fetchUrlMethod || DEFAULT_HTTP_METHOD,
      signal: runner.activeAbort.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name !== "AbortError") error.value = err;
  } finally {
    isLoading.value = false;
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
  const isLoading = ref(Boolean(options.fetchUrl));
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
      options,
      scopeState.value,
      runner,
      data,
      isLoading,
      error,
    );

  const refresh = async () => {
    if (runner.pendingTimer) clearTimeout(runner.pendingTimer);
    await performFetch();
  };

  const currentInputs = () =>
    `${scopeState.value?.key ?? ""}|${JSON.stringify(options.watchSource?.() ?? null)}`;

  const fetchScheduledInputs = () => {
    runner.lastInputs = currentInputs();
    void performFetch();
  };

  // A period scope registers during the PeriodSelector's setup, which lands
  // before or after a card's own mount depending on which chunk resolves
  // first. Either way both the watcher and onMounted end up looking at the
  // same freshly registered scope and each ask for a refresh; keying on the
  // inputs the last fetch was started for collapses that into one request.
  const scheduleRefresh = () => {
    if (runner.pendingTimer) clearTimeout(runner.pendingTimer);
    if (options.periodScope && !scopeState.value) return;
    const inputs = currentInputs();
    if (inputs === runner.lastInputs) return;
    if (!runner.hasFetchedOnce) {
      runner.hasFetchedOnce = true;
      fetchScheduledInputs();
      return;
    }
    runner.pendingTimer = setTimeout(fetchScheduledInputs, DEBOUNCE_FRAME_MS);
  };

  // A realtime event means the data behind unchanged inputs moved, so it has
  // to bypass the deduplication above.
  const refreshFromRealtime = () => {
    runner.lastInputs = null;
    scheduleRefresh();
  };

  const fetchOnMount = () => {
    scheduleRefresh();
    if (runner.hasFetchedOnce) return;
    // The scope has not registered yet, and may never. Give it the grace
    // period usePeriodScope itself allows before it warns, then drop the
    // loading state so a misconfigured scope shows its empty value rather
    // than a skeleton that never resolves.
    setTimeout(() => {
      if (!runner.hasFetchedOnce) isLoading.value = false;
    }, PENDING_SCOPE_GRACE_MS);
  };

  if (options.fetchUrl) {
    watch(
      () => [scopeState.value?.key, options.watchSource?.()],
      scheduleRefresh,
    );
    onMounted(fetchOnMount);
    subscribeRealtimeTopics(options.realtimeTopic, refreshFromRealtime);
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
