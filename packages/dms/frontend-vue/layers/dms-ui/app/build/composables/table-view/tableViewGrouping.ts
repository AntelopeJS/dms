import {
  TABLE_DISPLAY_ID,
  CARDS_DISPLAY_ID,
} from "../../../composables/table-view/types";
import { KANBAN_DISPLAY_BRIDGE_KEY } from "../../../composables/table-view/kanban";
import { describeTableWriteError } from "./utils/writeError";
import { buildTableQuery, isFilterEffective } from "./utils/tableQuery";
import { useGroupedRows } from "./useGroupedRows";
import { useTableReorder } from "./useTableReorder";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewReorder<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "displayComponent"
    | "listState"
    | "configuration"
    | "rows"
    | "querySorting"
    | "tabs"
    | "displayOptions"
    | "sortRecovery"
    | "arrival"
    | "props"
  >,
) {
  const { reorderConfig } = scope.displayComponent;
  const { data, refresh } = scope.listState;
  const { ROW_ID_DEFAULT_KEY, location, tableProps, allColumns } =
    scope.configuration;
  const { $authFetch } = scope.rows;
  const { effectiveColumnFilters, effectiveGlobalFilter } = scope.querySorting;
  const { activeTabFilters, t } = scope.tabs;
  const { activeDisplayId } = scope.displayOptions;
  const { toast } = scope.sortRecovery;
  const { processI18n } = scope.arrival;
  const { props } = scope;
  const ORDERED_DISPLAY_IDS = new Set([TABLE_DISPLAY_ID, CARDS_DISPLAY_ID]);
  const { reorderState } = useTableReorder<T>({
    reorder: reorderConfig,
    data,
    rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
    location,
    api: $authFetch,
    canEdit: computed(() => isActionEnabled(tableProps.value.rowActions?.edit)),
    isNarrowed: computed(
      () =>
        effectiveColumnFilters.value.some(isFilterEffective) ||
        !!effectiveGlobalFilter.value ||
        activeTabFilters.value.length > 0,
    ),
    isOrderedDisplay: computed(() =>
      ORDERED_DISPLAY_IDS.has(activeDisplayId.value),
    ),
    refresh: () => refresh(),
    onError: (failure) =>
      toast.add({
        title: t("dms.table.reorder.error"),
        description: describeTableWriteError(
          failure,
          t,
          allColumns,
          processI18n,
        ),
        color: Color.error,
        icon: "i-ph-warning-circle",
      }),
  });
  return { reorderState };
}

export function useTableViewGrouping<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "groupingOptions"
    | "querySorting"
    | "listState"
    | "queryFilters"
    | "query"
    | "rows"
    | "displayPreferences"
    | "configuration"
    | "props"
    | "deferred"
  >,
) {
  const { activeGroupedOptions } = scope.groupingOptions;
  const { isGroupedDisplay, effectiveColumnFilters, effectiveGlobalFilter } =
    scope.querySorting;
  const { shownResults } = scope.listState;
  const { hiddenFilters } = scope.queryFilters;
  const { archiveQuery } = scope.query;
  const { tableRows } = scope.rows;
  const { kanbanGroupBy } = scope.displayPreferences;
  const { tableProps } = scope.configuration;
  const { props } = scope;
  const { deferred } = scope;
  const { grouping, refreshCounts: refreshGroupCounts } = useGroupedRows({
    grouped: activeGroupedOptions,
    isActive: isGroupedDisplay,
    columns: props.columns,
    rows: shownResults,
    countQuery: (filter) => ({
      ...buildTableQuery({
        pagination: { pageIndex: 0, pageSize: 0 },
        sorting: [],
        columnFilters: [...effectiveColumnFilters.value, filter],
        hiddenFilters: hiddenFilters.value,
        globalFilter: effectiveGlobalFilter.value,
      }),
      ...archiveQuery.value,
    }),
    countBatch: tableRows.countBatch,
  });

  provide(KANBAN_DISPLAY_BRIDGE_KEY, {
    groupByField: kanbanGroupBy,
    editAction: tableProps.value.rowActions?.edit,
    deleteAction: tableProps.value.rowActions?.delete,
    onCardMoved: () => void deferred.refreshCounts(),
  });
  return { refreshGroupCounts, grouping };
}
