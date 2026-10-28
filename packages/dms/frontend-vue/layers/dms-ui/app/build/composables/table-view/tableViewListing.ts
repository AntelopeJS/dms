import { readFetchNotFound } from "../../utils/fetchNotFound";
import { buildTableQuery } from "./utils/tableQuery";
import { useAccumulatedPages } from "./useAccumulatedPages";
import { useTableRows } from "./useTableRows";
import { orderGroupedRows } from "./utils/groupedRows";
import { useTableListData } from "./useTableListData";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewRows<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "configuration" | "arrival" | "props" | "deferred"
  >,
) {
  const { location } = scope.configuration;
  const { route } = scope.arrival;
  const { props } = scope;
  const { deferred } = scope;
  const { $authFetch } = useAuthFetch();

  const tableRows = useTableRows<T>({
    api: $authFetch,
    location,
    source: props.source,
    columns: props.columns,
    route: () => ({
      routeParams: props.routeParams,
      routeQuery: route.query,
    }),

    pinnedRows: () =>
      deferred.isGroupedDisplay.value ? undefined : props.pinnedRows,
  });
  return { $authFetch, tableRows };
}

export function useTableViewQuery<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "urlFilters"
    | "querySorting"
    | "queryFilters"
    | "filterState"
    | "configuration"
    | "props"
  >,
) {
  const { paginationState } = scope.urlFilters;
  const { effectiveSorting, effectiveColumnFilters, effectiveGlobalFilter } =
    scope.querySorting;
  const { hiddenFilters } = scope.queryFilters;
  const { showArchived } = scope.filterState;
  const { archiveMode } = scope.configuration;
  const { props } = scope;
  const paginationMode = props.pagination ?? "pages";
  const { isAccumulating, requestedPagination, loadNextPage } =
    useAccumulatedPages({
      mode: paginationMode,
      pagination: paginationState,
      resetOn: [
        effectiveSorting,
        effectiveColumnFilters,
        hiddenFilters,
        effectiveGlobalFilter,
        showArchived,
      ],
    });

  const queryRequest = computed(() =>
    buildTableQuery({
      pagination: requestedPagination.value,
      sorting: effectiveSorting.value,
      columnFilters: effectiveColumnFilters.value,
      hiddenFilters: hiddenFilters.value,
      globalFilter: effectiveGlobalFilter.value,
    }),
  );
  const archiveQuery = computed(() =>
    archiveMode ? { showArchived: showArchived.value } : {},
  );
  return {
    archiveQuery,
    queryRequest,
    loadNextPage,
    isAccumulating,
    requestedPagination,
    paginationMode,
  };
}

export function useTableViewListState<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rows"
    | "query"
    | "displayComponent"
    | "liveHold"
    | "tabs"
    | "groupingOptions"
    | "querySorting"
    | "urlFilters"
  >,
) {
  const { componentId, pageId } = scope.configuration;
  const { tableRows } = scope.rows;
  const { queryRequest, archiveQuery } = scope.query;
  const { isActiveDisplaySelfManaged } = scope.displayComponent;
  const { liveHold } = scope.liveHold;
  const { te, locale } = scope.tabs;
  const { activeGroupedOptions } = scope.groupingOptions;
  const { isGroupedDisplay, pickedSorting } = scope.querySorting;
  const { rowSelect } = scope.urlFilters;
  const { data, status, error, refresh } = useTableListData<T>({
    componentId,
    pageId,
    rows: tableRows,
    query: queryRequest,
    archiveQuery,
    isSelfManaged: isActiveDisplaySelfManaged,
    heldQuery: liveHold.heldQuery,
  });

  const settledError = computed(() =>
    status.value === "pending" ? null : error.value,
  );

  const isFirstPageLoading = computed(
    () => data.value === null && !settledError.value,
  );
  const isListLoading = computed(
    () => status.value === "pending" || isFirstPageLoading.value,
  );

  const listLoadError = computed(() => {
    const failure = settledError.value;
    if (!failure) return undefined;
    const message = resolveApiErrorMessage(failure);
    if (te(`${message}.description`) || te(message)) return message;
    const details: { statusCode?: number } = failure;
    const status = details.statusCode;
    return status && te(`error.${status}.description`)
      ? `error.${status}`
      : "error.500";
  });

  const listNotFound = computed(() => readFetchNotFound(settledError.value));

  const shownData = computed(() =>
    listLoadError.value ? undefined : data.value,
  );
  const shownResults = computed(() => {
    const results = shownData.value?.results;
    const grouped = activeGroupedOptions.value;
    return results && isGroupedDisplay.value && grouped
      ? orderGroupedRows(results, grouped, pickedSorting.value, locale.value)
      : results;
  });

  watch(listLoadError, (message) => {
    if (message) rowSelect.value = {};
  });
  return {
    data,
    error,
    listLoadError,
    shownResults,
    isListLoading,
    refresh,
    shownData,
    isFirstPageLoading,
    listNotFound,
  };
}

export function useTableViewListPagination<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "listState" | "displayComponent" | "urlFilters"
  >,
) {
  const { listLoadError, data } = scope.listState;
  const { isActiveDisplaySelfManaged } = scope.displayComponent;
  const { paginationState } = scope.urlFilters;
  const activeDisplayBlockedByError = computed(
    () => !!listLoadError.value && !isActiveDisplaySelfManaged.value,
  );

  watch(
    [() => data.value?.total, () => paginationState.value.pageSize],
    ([total, pageSize]) => {
      if (total === undefined || total === null || pageSize <= 0) return;
      const maxPageIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
      if (paginationState.value.pageIndex > maxPageIndex) {
        paginationState.value = {
          ...paginationState.value,
          pageIndex: maxPageIndex,
        };
      }
    },
  );
  return { activeDisplayBlockedByError };
}
