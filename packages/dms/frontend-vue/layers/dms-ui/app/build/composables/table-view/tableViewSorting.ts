import type { SortingState } from "@tanstack/vue-table";
import type { TableViewGroupedConfig } from "../../../composables/table-view/types";
import { GROUPED_DISPLAY_ID } from "../../../composables/table-view/types";
import {
  isSameSorting,
  isUnsortableFieldError,
  defaultSortingState,
  resolveDefaultSortConfig,
  sanitizeSorting,
  sortingOrDefault,
  sortableColumnIds,
  sortValueKind,
} from "./utils/sortableColumns";
import {
  groupedOptionsFor,
  listTableSorting,
  pickedTableSorting,
  type TableSortingInput,
  isGroupableColumn,
} from "./utils/groupedRows";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewGroupingOptions<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "configuration" | "displayOptions" | "arrival"
  >,
) {
  const { allColumns } = scope.configuration;
  const { groupedOptions } = scope.displayOptions;
  const { processI18n, tablePreferences } = scope.arrival;
  const declaredSortableIds = sortableColumnIds(allColumns);

  const refusedSortIds = ref<string[]>([]);
  const sortableIds = computed(
    () =>
      new Set(
        [...declaredSortableIds].filter(
          (id) => !refusedSortIds.value.includes(id),
        ),
      ),
  );

  const groupedGroupByOptions = groupedOptions
    ? allColumns
        .filter(
          (column) =>
            column.accessorKey === groupedOptions.groupByField ||
            (isGroupableColumn(column) &&
              declaredSortableIds.has(column.accessorKey)),
        )
        .map((column) => ({
          label: processI18n(column.header),
          value: column.accessorKey,
        }))
    : [];
  const defaultGroupedGroupBy = groupedOptions?.groupByField ?? "";
  const groupedGroupBy = ref<string>(defaultGroupedGroupBy);
  tablePreferences.restore(
    "groupedGroupBy",
    groupedGroupBy,
    (field) =>
      !groupedOptions || groupedGroupByOptions.some((o) => o.value === field),
  );
  const activeGroupedOptions = computed<TableViewGroupedConfig | undefined>(
    () =>
      groupedOptions &&
      groupedOptionsFor(groupedOptions, groupedGroupBy.value, allColumns),
  );
  return {
    declaredSortableIds,
    activeGroupedOptions,
    sortableIds,
    refusedSortIds,
    groupedGroupBy,
    defaultGroupedGroupBy,
    groupedGroupByOptions,
  };
}

export function useTableViewDefaultSorting<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "groupingOptions"
    | "urlFilters"
    | "displayComponent"
    | "arrival"
  >,
) {
  const { defaultSort, allColumns } = scope.configuration;
  const { declaredSortableIds } = scope.groupingOptions;
  const { columnLabel } = scope.urlFilters;
  const { reorderConfig } = scope.displayComponent;
  const { tablePreferences } = scope.arrival;
  const tableDefaultSort = resolveDefaultSortConfig(
    defaultSort,
    declaredSortableIds,
    import.meta.env.DEV ? (message) => console.warn(message) : undefined,
  );
  const defaultSortState: SortingState = defaultSortingState(tableDefaultSort);

  const defaultSortLabel = tableDefaultSort
    ? columnLabel(tableDefaultSort.field)
    : undefined;
  const defaultSortKind = tableDefaultSort
    ? sortValueKind(
        allColumns.find(
          (c) => (c.id ?? c.accessorKey) === tableDefaultSort.field,
        )?.type?.id,
      )
    : undefined;

  const sorting = ref<SortingState>(
    reorderConfig
      ? defaultSortState
      : sortingOrDefault(
          tablePreferences.get<SortingState>("sorting", defaultSortState),
          declaredSortableIds,
          defaultSortState,
        ),
  );
  return {
    sorting,
    defaultSortState,
    tableDefaultSort,
    defaultSortLabel,
    defaultSortKind,
  };
}

export function useTableViewQuerySorting<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "displayComponent"
    | "filterState"
    | "displayOptions"
    | "groupingOptions"
    | "defaultSorting"
  >,
) {
  const { activeCapabilities, reorderConfig } = scope.displayComponent;
  const { columnFilters, globalFilterDebounced } = scope.filterState;
  const { activeDisplayId, groupedOptions } = scope.displayOptions;
  const { activeGroupedOptions, sortableIds } = scope.groupingOptions;
  const { sorting, defaultSortState } = scope.defaultSorting;
  const effectiveColumnFilters = computed<TableFilter[]>(() =>
    activeCapabilities.value.filters
      ? columnFilters.value
      : columnFilters.value.filter((f) => f.pinned),
  );
  const effectiveGlobalFilter = computed(() =>
    activeCapabilities.value.search ? globalFilterDebounced.value : undefined,
  );
  const isGroupedDisplay = computed(
    () => activeDisplayId.value === GROUPED_DISPLAY_ID && !!groupedOptions,
  );
  const sortingInput = computed<TableSortingInput>(() => ({
    reorderField: reorderConfig?.field,
    grouped: isGroupedDisplay.value ? activeGroupedOptions.value : undefined,
    canSort: activeCapabilities.value.sorting,
    sorting: sorting.value,
    defaultSorting: defaultSortState,
  }));

  const pickedSorting = computed(() => pickedTableSorting(sortingInput.value));
  const effectiveSorting = computed<SortingState>(() => {
    const listed = listTableSorting(sortingInput.value);

    return reorderConfig && !sortingInput.value.grouped
      ? listed
      : sanitizeSorting(listed, sortableIds.value);
  });
  return {
    isGroupedDisplay,
    effectiveSorting,
    effectiveColumnFilters,
    effectiveGlobalFilter,
    pickedSorting,
  };
}

export function useTableViewSortRecovery<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "defaultSorting"
    | "groupingOptions"
    | "urlFilters"
    | "listState"
    | "querySorting"
    | "tabs"
  >,
) {
  const { sorting, defaultSortState } = scope.defaultSorting;
  const { sortableIds, refusedSortIds } = scope.groupingOptions;
  const { paginationState, columnLabel } = scope.urlFilters;
  const { error } = scope.listState;
  const { effectiveSorting } = scope.querySorting;
  const { t } = scope.tabs;
  watch(
    sorting,
    (next, previous) => {
      const sanitized = sortingOrDefault(
        next,
        sortableIds.value,
        defaultSortState,
      );
      if (!isSameSorting(sanitized, next)) {
        sorting.value = sanitized;
        return;
      }
      const before = sortingOrDefault(
        previous,
        sortableIds.value,
        defaultSortState,
      );
      if (
        !isSameSorting(sanitized, before) &&
        paginationState.value.pageIndex !== 0
      ) {
        paginationState.value = { ...paginationState.value, pageIndex: 0 };
      }
    },
    { deep: true, flush: "sync" },
  );

  const toast = useToast();

  watch(error, (failure) => {
    if (!failure || !isUnsortableFieldError(failure)) return;
    const refused = effectiveSorting.value[0]?.id;
    if (!refused) return;
    refusedSortIds.value = [...refusedSortIds.value, refused];
    sorting.value = sanitizeSorting(sorting.value, sortableIds.value);
    toast.add({
      title: t("dms.sort.reset_title"),
      description: t("dms.sort.reset_description", {
        column: columnLabel(refused),
      }),
      color: Color.warning,
      icon: "i-ph-warning",
    });
  });
  return { toast };
}
