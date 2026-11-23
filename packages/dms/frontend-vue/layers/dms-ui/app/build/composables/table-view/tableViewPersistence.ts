import { watchDebounced } from "@vueuse/core";
import type { MaybeRef, Ref } from "vue";
import type { TableField } from "#dms-core/app/entries/composables/user/tablePreferences";
import type { TablePreferenceValues } from "./useTablePreferences";
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
  const persist = <F extends TableField>(
    field: F,
    state: Ref<TablePreferenceValues[F]>,
    defaultValue: MaybeRef<TablePreferenceValues[F]>,
  ) => {
    watch(
      state,
      (newValue) => {
        tablePreferences.set(field, newValue, unref(defaultValue));
      },
      { deep: true },
    );
  };

  if (!reorderConfig) persist("sorting", sorting, defaultSortState);
  persist("columnFilters", columnFilters, []);
  persist("columnVisibility", columnVisibility, initialVisibility);
  persist("filtersOpen", filtersRowOpen, hasEmptyDefaultFilter);
  persist("activeTab", activeTabId, ALL_TAB_ID);
  persist("viewMode", activeDisplayId, displayDefault);
  persist("columnOrder", columnOrder, []);
  persist("kanbanGroupBy", kanbanGroupBy, defaultKanbanGroupBy);
  persist("groupedGroupBy", groupedGroupBy, defaultGroupedGroupBy);
  persist("density", density, defaultDensity);
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
