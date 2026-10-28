import { selectedRowIds } from "./utils/bulkActions";
import { isBulkAction } from "../actions/bulkSelection";
import { selectionScopeKey } from "../../utils/selectionScope";
import type { CustomRowAction } from "../../../types/row-action";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewBulkSelection<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rowActions"
    | "footer"
    | "listState"
    | "querySorting"
    | "queryFilters"
    | "urlFilters"
    | "filterState"
    | "deferred"
  >,
) {
  const { tableProps, archiveMode } = scope.configuration;
  const { handleBulkCustomAction } = scope.rowActions;
  const { baseQuery } = scope.footer;
  const { data } = scope.listState;
  const { effectiveColumnFilters, effectiveGlobalFilter } = scope.querySorting;
  const { hiddenFilters } = scope.queryFilters;
  const { rowSelect, paginationState } = scope.urlFilters;
  const { showArchived } = scope.filterState;
  const { deferred } = scope;
  const bulkCustomActions = computed(() =>
    (tableProps.value.rowActions?.custom ?? []).filter(isBulkAction),
  );
  const allMatching = ref(false);
  const runBulkAction = (action: CustomRowAction) =>
    handleBulkCustomAction(
      action,
      allMatching.value
        ? { matching: baseQuery.value, count: data.value?.total ?? 0 }
        : {
            ids: deferred.selectedIds.value,
            count: deferred.selectedIds.value.length,
          },
    );

  const canToggleArchived = computed(
    () => !!archiveMode && tableProps.value.rowActions?.showArchived === true,
  );

  const selectionScope = computed(() =>
    selectionScopeKey({
      columnFilters: effectiveColumnFilters.value,
      hiddenFilters: hiddenFilters.value,
      globalFilter: effectiveGlobalFilter.value,
    }),
  );
  watch(selectionScope, () => {
    rowSelect.value = {};
  });

  watch(showArchived, () => {
    rowSelect.value = {};
    paginationState.value = { ...paginationState.value, pageIndex: 0 };
  });
  return { allMatching, bulkCustomActions, runBulkAction, canToggleArchived };
}

export function useTableViewDisplaySelection<T extends Data>(
  scope: Pick<TableViewScope<T>, "urlFilters" | "listState" | "rowRealtime">,
) {
  const { rowSelect } = scope.urlFilters;
  const { shownResults } = scope.listState;
  const { getRowId } = scope.rowRealtime;
  const selectedIds = computed(() => selectedRowIds(rowSelect.value));

  const isRowActionEnabled = (
    config: boolean | RowActionConfig | undefined,
    item: T,
  ): boolean => {
    const normalized = normalizeActionConfig(config);
    if (!normalized.isEnabled) return false;
    if (!normalized.rule) return true;
    return evaluateRowActionRule(normalized.rule, item);
  };

  const displaySelection = {
    isSelected: (id: string) => !!rowSelect.value[id],
    toggle: (id: string, value?: boolean) => {
      if (value ?? !rowSelect.value[id]) {
        rowSelect.value = { ...rowSelect.value, [id]: true };
        return;
      }
      const { [id]: _removed, ...rest } = rowSelect.value;
      rowSelect.value = rest;
    },

    toggleAll: (value?: boolean) => {
      const ids = (shownResults.value ?? [])
        .map((row) => getRowId(row))
        .filter((id): id is string => !!id);
      const allVisibleSelected =
        ids.length > 0 && ids.every((id) => rowSelect.value[id]);
      if (value ?? !allVisibleSelected) {
        rowSelect.value = {
          ...rowSelect.value,
          ...Object.fromEntries(ids.map((id) => [id, true])),
        };
        return;
      }
      const removed = new Set(ids);
      rowSelect.value = Object.fromEntries(
        Object.entries(rowSelect.value).filter(([id]) => !removed.has(id)),
      );
    },
    clear: () => {
      rowSelect.value = {};
    },
  };
  return { selectedIds, isRowActionEnabled, displaySelection };
}
