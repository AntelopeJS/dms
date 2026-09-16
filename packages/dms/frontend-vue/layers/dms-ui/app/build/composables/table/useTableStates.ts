import type { ModelRef } from "vue";
import type {
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/vue-table";
import type { TableFilter } from "../../components/table/Table.vue";

interface TableStates {
  globalFilterState: ModelRef<string>;
  columnFiltersState: ModelRef<TableFilter[]>;
  columnOrderState: ModelRef<string[]>;
  columnVisibilityState: ModelRef<VisibilityState>;
  columnPinningState: ModelRef<ColumnPinningState>;
  columnSizingState: ModelRef<ColumnSizingState>;
  rowSelectionState: ModelRef<RowSelectionState>;
  sortingState: ModelRef<SortingState>;
  expandedState: ModelRef<ExpandedState>;
  paginationState: ModelRef<PaginationState>;
}

export const useTableStates = (states: TableStates) => {
  const updateStateValue = (updaterOrValue: Updater<any>, stateRef: Ref) => {
    stateRef.value = isFunction(updaterOrValue)
      ? updaterOrValue(stateRef.value)
      : updaterOrValue;
  };

  const deleteFilter = (index: number) => {
    const filter = states.columnFiltersState.value[index];
    if (!filter || filter.pinned) return;
    states.columnFiltersState.value = states.columnFiltersState.value.filter(
      (_, i) => i !== index,
    );
  };

  const resetFilters = () => {
    states.columnFiltersState.value = states.columnFiltersState.value.map(
      (filter) => ({ ...filter, value: filter.initialValue }),
    );
  };

  const deleteSorting = (index: number) => {
    states.sortingState.value = states.sortingState.value.filter(
      (_, i) => i !== index,
    );
  };

  const stateHandlers = {
    onColumnVisibilityChange: (updater: Updater<VisibilityState>) =>
      updateStateValue(updater, states.columnVisibilityState),
    onColumnPinningChange: (updater: Updater<ColumnPinningState>) =>
      updateStateValue(updater, states.columnPinningState),
    onColumnSizingChange: (updater: Updater<ColumnSizingState>) =>
      updateStateValue(updater, states.columnSizingState),
    onGlobalFilterChange: (updater: Updater<string>) =>
      updateStateValue(updater, states.globalFilterState),
    onColumnOrderChange: (updater: Updater<string[]>) =>
      updateStateValue(updater, states.columnOrderState),
    onRowSelectionChange: (updater: Updater<RowSelectionState>) =>
      updateStateValue(updater, states.rowSelectionState),
    onSortingChange: (updater: Updater<SortingState>) =>
      updateStateValue(updater, states.sortingState),
    onExpandedChange: (updater: Updater<ExpandedState>) =>
      updateStateValue(updater, states.expandedState),
    onPaginationChange: (updater: Updater<PaginationState>) =>
      updateStateValue(updater, states.paginationState),
  };

  const stateGetters = {
    get globalFilter() {
      return states.globalFilterState.value;
    },
    get columnOrder() {
      return states.columnOrderState.value;
    },
    get columnVisibility() {
      return states.columnVisibilityState.value;
    },
    get columnPinning() {
      return states.columnPinningState.value;
    },
    get columnSizing() {
      return states.columnSizingState.value;
    },
    get rowSelection() {
      return states.rowSelectionState.value;
    },
    get sorting() {
      return states.sortingState.value;
    },
    get expanded() {
      return states.expandedState.value;
    },
    get pagination() {
      return states.paginationState.value;
    },
  };

  return {
    updateStateValue,
    deleteFilter,
    resetFilters,
    deleteSorting,
    stateHandlers,
    stateGetters,
  };
};
