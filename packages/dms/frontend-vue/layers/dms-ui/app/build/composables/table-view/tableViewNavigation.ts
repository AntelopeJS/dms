import { until } from "@vueuse/core";
import type { TableAccumulation } from "../../components/table/Table.vue";
import type { RowStep } from "../actions/rowNavigation";
import { rowLocator } from "./utils/locateRow";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewRowNavigation<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "displayComponent"
    | "displayOptions"
    | "listState"
    | "query"
    | "urlFilters"
    | "footer"
  >,
) {
  const { isActiveDisplaySelfManaged } = scope.displayComponent;
  const { activeDisplayId } = scope.displayOptions;
  const { shownResults, data, isListLoading, listLoadError } = scope.listState;
  const { isAccumulating, loadNextPage } = scope.query;
  const { paginationState } = scope.urlFilters;
  const { hasMoreRows } = scope.footer;
  const ADJACENT_ROWS_TIMEOUT_MS = 15_000;
  const listsServerPages = computed(() => !isActiveDisplaySelfManaged.value);

  const selfManagedRows = shallowRef<Data[]>([]);
  const setSelfManagedRows = (rows: T[]) => {
    selfManagedRows.value = rows;
  };
  watch(activeDisplayId, () => {
    selfManagedRows.value = [];
  });
  const navigableRows = (): Data[] =>
    listsServerPages.value ? (shownResults.value ?? []) : selfManagedRows.value;
  const loadedRowsOffset = () => {
    if (isAccumulating || !listsServerPages.value) return 0;
    const { pageIndex, pageSize } = paginationState.value;
    return pageSize > 0 ? pageIndex * pageSize : 0;
  };
  const turnPage = (step: RowStep): boolean => {
    if (isAccumulating) {
      if (step < 0 || !hasMoreRows.value) return false;
      loadNextPage();
      return true;
    }
    const { pageIndex, pageSize } = paginationState.value;
    const next = pageIndex + step;
    const total = data.value?.total ?? 0;
    if (pageSize <= 0 || next < 0 || next * pageSize >= total) return false;
    paginationState.value = { ...paginationState.value, pageIndex: next };
    return true;
  };
  let adjacentRowsLoad: Promise<boolean> | undefined;
  const loadAdjacentRows = (step: RowStep): Promise<boolean> => {
    if (adjacentRowsLoad) return adjacentRowsLoad;
    if (!listsServerPages.value || isListLoading.value || !turnPage(step)) {
      return Promise.resolve(false);
    }
    const before = shownResults.value;
    adjacentRowsLoad = until(
      () => shownResults.value !== before && !isListLoading.value,
    )
      .toBe(true, { timeout: ADJACENT_ROWS_TIMEOUT_MS })
      .then(() => !listLoadError.value && shownResults.value !== before)
      .finally(() => {
        adjacentRowsLoad = undefined;
      });
    return adjacentRowsLoad;
  };
  return {
    listsServerPages,
    navigableRows,
    loadedRowsOffset,
    loadAdjacentRows,
    setSelfManagedRows,
  };
}

export function useTableViewRowLocator<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "rowNavigation"
    | "rows"
    | "query"
    | "liveHold"
    | "configuration"
    | "listState"
    | "footer"
    | "props"
  >,
) {
  const { listsServerPages } = scope.rowNavigation;
  const { tableRows } = scope.rows;
  const { queryRequest, archiveQuery, requestedPagination, paginationMode } =
    scope.query;
  const { liveHold } = scope.liveHold;
  const { ROW_ID_DEFAULT_KEY } = scope.configuration;
  const { shownResults, isListLoading } = scope.listState;
  const { hasMoreRows, loadMoreRows } = scope.footer;
  const { props } = scope;
  const locateRow = rowLocator({
    list: async (offset, limit) => {
      if (!listsServerPages.value) return null;
      const page = await tableRows.listAsShown(
        {
          ...queryRequest.value,
          ...archiveQuery.value,
          ...liveHold.heldQuery(),
          offset,
          limit,
        },
        requestedPagination.value.pageSize,
      );
      return page && { results: page.results, total: page.total };
    },
    rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
    isWholeRead: () => !!props.source && !props.source.capabilities.paginate,
  });

  const accumulation = computed<TableAccumulation | undefined>(() =>
    paginationMode !== "pages"
      ? {
          mode: paginationMode,
          shown: shownResults.value?.length ?? 0,
          hasMore: hasMoreRows.value,
          loading: isListLoading.value,
          load: loadMoreRows,
        }
      : undefined,
  );
  return { locateRow, accumulation };
}
