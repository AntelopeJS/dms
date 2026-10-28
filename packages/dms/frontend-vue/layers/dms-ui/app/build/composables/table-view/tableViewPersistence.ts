import { watchDebounced } from "@vueuse/core";
import type { TableStatePreference } from "./tableViewTypes";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewStatePersistence<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "displayComponent"
    | "defaultSorting"
    | "filterState"
    | "configuration"
    | "tabs"
    | "arrival"
    | "displayOptions"
    | "displayPreferences"
    | "groupingOptions"
  >,
) {
  const { reorderConfig } = scope.displayComponent;
  const { sorting, defaultSortState } = scope.defaultSorting;
  const {
    columnFilters,
    columnVisibility,
    filtersRowOpen,
    hasEmptyDefaultFilter,
    displayDefault,
    columnOrder,
  } = scope.filterState;
  const { initialVisibility } = scope.configuration;
  const { activeTabId } = scope.tabs;
  const { ALL_TAB_ID, tablePreferences } = scope.arrival;
  const { activeDisplayId } = scope.displayOptions;
  const { kanbanGroupBy, defaultKanbanGroupBy, density, defaultDensity } =
    scope.displayPreferences;
  const { groupedGroupBy, defaultGroupedGroupBy } = scope.groupingOptions;
  const tableStatePreferences: TableStatePreference[] = [
    ...(reorderConfig
      ? []
      : [
          ["sorting", sorting, defaultSortState] satisfies TableStatePreference,
        ]),
    ["columnFilters", columnFilters, []],
    ["columnVisibility", columnVisibility, initialVisibility],
    ["filtersOpen", filtersRowOpen, hasEmptyDefaultFilter],
    ["activeTab", activeTabId, ALL_TAB_ID],
    ["viewMode", activeDisplayId, displayDefault],
    ["columnOrder", columnOrder, []],
    ["kanbanGroupBy", kanbanGroupBy, defaultKanbanGroupBy],
    ["groupedGroupBy", groupedGroupBy, defaultGroupedGroupBy],
    ["density", density, defaultDensity],
  ];

  tableStatePreferences.forEach(([field, state, defaultValue]) => {
    watch(
      state,
      (newValue) => {
        tablePreferences.set(field, newValue, unref(defaultValue));
      },
      { deep: true },
    );
  });
  return {};
}

export function useTableViewSizingPersistence<T extends Data>(
  scope: Pick<TableViewScope<T>, "arrival" | "filterState">,
) {
  const { tablePreferences } = scope.arrival;
  const { columnSizing } = scope.filterState;
  const COLUMN_SIZING_PERSIST_DEBOUNCE_MS = 500;
  let pendingColumnSizingWrite = false;

  const persistColumnSizing = () => {
    tablePreferences.set("columnSizing", columnSizing.value, {});
    pendingColumnSizingWrite = false;
  };

  watch(
    columnSizing,
    () => {
      pendingColumnSizingWrite = true;
    },
    { deep: true },
  );
  watchDebounced(columnSizing, persistColumnSizing, {
    deep: true,
    debounce: COLUMN_SIZING_PERSIST_DEBOUNCE_MS,
  });

  onBeforeUnmount(() => {
    if (pendingColumnSizingWrite) persistColumnSizing();
  });
  return {};
}
