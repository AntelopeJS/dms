import { buildTableQuery } from "./utils/tableQuery";
import { useTableFooter } from "./useTableFooter";
import type { TableViewScope } from "./tableViewScope";

export interface ActiveDisplayExposed {
  refresh?: () => Promise<void> | void;
}
export function useTableViewFooter<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "querySorting"
    | "queryFilters"
    | "query"
    | "configuration"
    | "listState"
    | "props"
  >,
) {
  const { effectiveSorting, effectiveColumnFilters, effectiveGlobalFilter } =
    scope.querySorting;
  const { hiddenFilters } = scope.queryFilters;
  const { archiveQuery, loadNextPage } = scope.query;
  const { location, componentId, pageId } = scope.configuration;
  const { data, shownResults, isListLoading } = scope.listState;
  const { props } = scope;

  const activeDisplayRef = ref<ActiveDisplayExposed | null>(null);

  const baseQuery = computed(() => {
    const {
      limit: _limit,
      offset: _offset,
      ...query
    } = buildTableQuery({
      pagination: { pageIndex: 0, pageSize: 0 },
      sorting: effectiveSorting.value,
      columnFilters: effectiveColumnFilters.value,
      hiddenFilters: hiddenFilters.value,
      globalFilter: effectiveGlobalFilter.value,
    });
    return { ...query, ...archiveQuery.value };
  });

  const { footer: resolvedFooter, refreshSummaries } = useTableFooter({
    footer: props.footer,
    columns: props.columns,
    location,
    query: baseQuery,
    dataKey: `table-view-${componentId}-${pageId}`,
  });

  const hasMoreRows = computed(
    () => (data.value?.total ?? 0) > (shownResults.value?.length ?? 0),
  );
  const loadMoreRows = () => {
    if (hasMoreRows.value && !isListLoading.value) loadNextPage();
  };
  return {
    hasMoreRows,
    loadMoreRows,
    refreshSummaries,
    activeDisplayRef,
    baseQuery,
    resolvedFooter,
  };
}
