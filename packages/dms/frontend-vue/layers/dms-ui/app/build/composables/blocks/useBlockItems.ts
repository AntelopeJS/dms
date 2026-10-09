import { computed, type ComputedRef } from "vue";
import { useChartFetch } from "../../../composables/chart/useChartFetch";
import { useComponentEvent } from "../../../../../dms-core/app/composables/components/useComponentEvent";
import { useWatch } from "../../../../../dms-core/app/composables/watch/useWatch";
import type { WatchAction } from "../../../../../dms-core/app/types/watch";

/** What a list block's `fetchUrl` answers with. */
export interface BlockItemsResponse<T> {
  items?: T[];
}

export interface UseBlockItemsOptions<T> {
  /** The items written in the block's options (read reactively). */
  items: () => T[] | undefined;
  /**
   * Route answering `{ items }`; when set it replaces the static items. Its
   * `{{params.X}}` and `{{query.X}}` tokens are filled from the page URL, and
   * nothing is requested while one has no value (see useChartFetch).
   */
  fetchUrl?: string;
  fetchUrlMethod?: string;
  /** The parameters of the page route (the block's `routeParams` prop). */
  routeParams?: () => Record<string, string> | undefined;
  watchActions?: WatchAction[];
  componentId?: string;
}

export interface UseBlockItemsReturn<T> {
  items: ComputedRef<T[]>;
  /** First load of a fetched list: nothing to show yet. */
  isPending: ComputedRef<boolean>;
  /** The first load failed; a refetch failure keeps the last items. */
  hasError: ComputedRef<boolean>;
  refresh: () => Promise<void>;
}

/**
 * The items a list block (StatGroup, KeyValueList, NavCardGrid) renders:
 * either the static ones of its options, or the `items` its `fetchUrl`
 * answers with — refetched when a watched event changes the block's state or
 * the page asks its blocks to refresh (refreshPageBlocks), like the KPI and
 * top-list cards.
 */
export function useBlockItems<T>(
  options: UseBlockItemsOptions<T>,
): UseBlockItemsReturn<T> {
  useComponentEvent(options.componentId);
  const { state: watchState } = useWatch(
    options.watchActions || [],
    options.componentId,
  );
  const watchKey = computed(() => JSON.stringify(watchState.value));

  const { data, isLoading, error, refresh } = useChartFetch<
    BlockItemsResponse<T>
  >({
    fetchUrl: options.fetchUrl,
    fetchUrlMethod: options.fetchUrlMethod,
    routeParams: options.routeParams,
    watchSource: () => watchKey.value,
  });

  const isFetched = Boolean(options.fetchUrl);
  const items = computed<T[]>(() =>
    isFetched ? (data.value?.items ?? []) : (options.items() ?? []),
  );
  const isPending = computed(
    () => isFetched && isLoading.value && data.value === null,
  );
  const hasError = computed(
    () => isFetched && !isLoading.value && data.value === null && !!error.value,
  );

  return { items, isPending, hasError, refresh };
}
