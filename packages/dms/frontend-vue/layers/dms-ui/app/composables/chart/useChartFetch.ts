import { isFunction } from "../../../../dms-core/app/utils/type-check";
import {
  computed,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  appendPeriodToUrl,
  usePeriodScope,
} from "../../../../dms-core/app/composables/period/usePeriodScope";
import {
  hasUrlVariables,
  resolveUrlVariables,
} from "../../build/utils/urlVariables";
import { useRefreshTriggers } from "../../build/composables/blocks/useRefreshTriggers";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";

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
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- This source is only JSON-stringified for equality; inference has no value and Vue WatchSource's generic owner deliberately permits any result.
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
  /**
   * Why the last request failed. A 404 also clears `data`: read it with
   * `readFetchNotFound` to draw a not-found state rather than a load error.
   */
  error: Ref<unknown>;
  refresh: () => Promise<void>;
}

const DEBOUNCE_FRAME_MS = 180;

export const PENDING_SCOPE_TIMEOUT_MS = 10_000;

/** What a card asks for: its URL with its period, and the state it watches. */
interface ChartRequest {
  /** `null` while a token or the period scope has no value yet. */
  url: string | null;
  watched: string;
}

function isSameRequest(left: ChartRequest, right: ChartRequest): boolean {
  return left.url === right.url && left.watched === right.watched;
}

function readStaticData<T>(
  source: UseChartFetchOptions<T>["staticData"],
): T | null {
  if (isFunction(source)) {
    return source();
  }
  return source ?? null;
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
      routeQuery: route.query,
    }),
  );
}

interface ScheduledRequest {
  /** The request the card is on. */
  current: Ref<ChartRequest>;
  /** Inputs changed, and their request waits for them to hold still. */
  isScheduled: Ref<boolean>;
  /** Moves to the latest inputs at once; whether the request changed. */
  flush(): boolean;
}

/**
 * The request the card is on: the first one at once, each later one once the
 * inputs have held still for a frame, so a period changed and changed back
 * requests nothing. A server render keeps the one its setup saw.
 */
function useScheduledRequest(
  target: ComputedRef<ChartRequest>,
): ScheduledRequest {
  const current = shallowRef(target.value);
  const isScheduled = ref(false);
  if (typeof window === "undefined")
    return { current, isScheduled, flush: () => false };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    isScheduled.value = false;
    if (isSameRequest(current.value, target.value)) return false;
    current.value = target.value;
    return true;
  };
  watch(target, (next) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (isSameRequest(next, current.value)) {
      isScheduled.value = false;
      return;
    }
    if (current.value.url === null) {
      flush();
      return;
    }
    isScheduled.value = true;
    timer = setTimeout(flush, DEBOUNCE_FRAME_MS);
  });
  return { current, isScheduled, flush };
}

/**
 * Whether a card bound to a period scope is still waiting for it to register:
 * until a selector does, or `PENDING_SCOPE_TIMEOUT_MS` after mounting.
 */
function useScopeWait(isWaiting: () => boolean): ComputedRef<boolean> {
  const gaveUp = ref(false);
  onMounted(() => {
    if (!isWaiting()) return;
    setTimeout(() => {
      gaveUp.value = true;
    }, PENDING_SCOPE_TIMEOUT_MS);
  });
  return computed(() => isWaiting() && !gaveUp.value);
}

function useDebouncedRefresh(
  refresh: () => Promise<void>,
  isPending: () => boolean,
): () => Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting: Promise<void> | null = null;
  let resolveWaiting = () => {};
  const finish = () => {
    resolveWaiting();
    waiting = null;
  };
  const finishIfSettled = () => {
    if (!timer && !isPending()) finish();
  };
  watch(isPending, finishIfSettled);
  if (getCurrentScope())
    onScopeDispose(() => {
      if (timer) clearTimeout(timer);
      timer = null;
      finish();
    });
  return () => {
    if (timer) clearTimeout(timer);
    waiting ??= new Promise<void>((resolve) => (resolveWaiting = resolve));
    timer = setTimeout(() => {
      timer = null;

      void refresh().then(finishIfSettled, finishIfSettled);
    }, DEBOUNCE_FRAME_MS);
    return waiting;
  };
}

/**
 * The data of a block that reads `fetchUrl`, through `useApiData`: a server
 * render requests it and hands it to the browser, unless the URL waits for a
 * period the server cannot resolve as the browser would (see
 * `usePeriodScope`); the browser then requests it once mounted. The period of
 * `periodScope` is sent with the request, and the block reads again when the
 * period, the watched state or the URL's tokens change (once they hold still
 * for a frame) and on each event of `realtimeTopic`.
 */
export function useChartFetch<T>(
  options: UseChartFetchOptions<T>,
): UseChartFetchReturn<T> {
  if (!options.fetchUrl) return useStaticChartData(options);
  const resolvedUrl = useResolvedFetchUrl(options);
  const scopeState = usePeriodScope(options.periodScope);
  const target = computed<ChartRequest>(() => {
    const url = resolvedUrl.value;
    const waitsForScope = !!options.periodScope && !scopeState.value;
    return {
      url:
        !url || waitsForScope
          ? null
          : (appendPeriodToUrl(url, scopeState.value) ?? null),
      watched: JSON.stringify(options.watchSource?.() ?? null),
    };
  });
  const request = useScheduledRequest(target);
  const loaded = useApiData<T | null>(() => request.current.value.url, {
    method: options.fetchUrlMethod,

    lazy: true,
    default: () => readStaticData(options.staticData),
    watch: [() => request.current.value.watched],

    refreshOnPageRefresh: false,
  });
  const { data, status, error } = loaded;

  watch(error, (failure) => {
    if (failure && readFetchNotFound(failure)) data.value = null;
  });
  const isWaitingForScope = useScopeWait(
    () => !!resolvedUrl.value && !!options.periodScope && !scopeState.value,
  );
  const isLoading = computed(
    () =>
      request.isScheduled.value ||
      status.value === "pending" ||
      (status.value === "idle" && request.current.value.url !== null) ||
      isWaitingForScope.value,
  );
  const refresh = async () => {
    await loaded.refresh(request.flush() ? { dedupe: "defer" } : undefined);
  };

  useRefreshTriggers(
    options.realtimeTopic,
    useDebouncedRefresh(
      () => loaded.refresh(),
      () => status.value === "pending",
    ),
  );
  return { data, isLoading, error, refresh };
}

/** A block without `fetchUrl`: its `staticData`, followed as it changes. */
function useStaticChartData<T>(
  options: UseChartFetchOptions<T>,
): UseChartFetchReturn<T> {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Vue deeply unwraps static data, which need not remain T; retain the existing public ref contract and reactive behavior.
  const data = ref<T | null>(
    readStaticData(options.staticData),
  ) as Ref<T | null>;
  if (isFunction(options.staticData))
    watch(
      () => readStaticData(options.staticData),
      (next) => {
        data.value = next;
      },
    );
  return {
    data,
    isLoading: ref(false),
    error: ref<unknown>(null),
    refresh: async () => {},
  };
}
