import { useTableViews } from "./useTableViews";
import { useMobileDisplay } from "./useMobileDisplay";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewViews<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "pinnedFilters"
    | "defaultSorting"
    | "configuration"
    | "filterState"
    | "displayPreferences"
    | "displayOptions"
    | "urlFilters"
    | "arrival"
    | "props"
  >,
) {
  const { pinnedDefaultFilters } = scope.pinnedFilters;
  const { defaultSortState, sorting } = scope.defaultSorting;
  const { initialVisibility, listableColumns } = scope.configuration;
  const {
    displayDefault,
    columnFilters,
    globalFilter,
    columnVisibility,
    columnOrder,
  } = scope.filterState;
  const { DEFAULT_DENSITY, density } = scope.displayPreferences;
  const { offeredDisplayIds, activeDisplayId } = scope.displayOptions;
  const { paginationState } = scope.urlFilters;
  const { tablePreferences, urlScope } = scope.arrival;
  const { props } = scope;
  const {
    items: tableViewItems,
    activeViewId,
    activeView,
    isModified: isViewModified,
    canSaveViews,
    selectView,
    openLinkedView,
    resetView,
    saveView,
    saveAsNewView,
    deleteView,
  } = useTableViews({
    views: props.views,
    defaults: {
      pinnedFilters: pinnedDefaultFilters,
      sorting: defaultSortState,
      visibility: initialVisibility,
      columnOrder: listableColumns.map(
        (column) => column.id ?? column.accessorKey,
      ),

      get display() {
        return displayDefault.value;
      },
      density: props.density ?? DEFAULT_DENSITY,
      displays: offeredDisplayIds,
    },
    state: {
      columnFilters,
      globalFilter,
      sorting,
      columnVisibility,
      columnOrder,
      display: activeDisplayId,
      density,
      pagination: paginationState,
    },
    preferences: tablePreferences,
    urlScope,
  });
  return {
    activeViewId,
    activeView,
    tableViewItems,
    openLinkedView,
    canSaveViews,
    isViewModified,
    selectView,
    resetView,
    saveView,
    saveAsNewView,
    deleteView,
  };
}

export function useTableViewMobileDisplay<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "filterState" | "displayOptions" | "views" | "arrival" | "props"
  >,
) {
  const { displayDefault } = scope.filterState;
  const { offeredDisplayIds, activeDisplayId, isDefaultDisplayStandalone } =
    scope.displayOptions;
  const { activeView } = scope.views;
  const { tablePreferences } = scope.arrival;
  const { props } = scope;
  useMobileDisplay({
    mobileDisplay: props.mobileDisplay,
    defaultDisplay: displayDefault,
    offered: offeredDisplayIds,
    display: activeDisplayId,
    activeView,
    isDisplayChosen: () =>
      isDefaultDisplayStandalone ||
      tablePreferences.get<string | undefined>("viewMode", undefined) !==
        undefined,
  });
  return {};
}
