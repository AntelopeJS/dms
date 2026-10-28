import { TableViewEvents } from "../../../composables/table-view/types";
import { selectedRowIds } from "./utils/bulkActions";
import { type WatchOptions, type WatchSource } from "vue";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewEvents<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "arrival"
    | "configuration"
    | "filterState"
    | "defaultSorting"
    | "urlFilters"
  >,
) {
  const { sendComponentEvent } = scope.arrival;
  const { componentId } = scope.configuration;
  const { columnFilters } = scope.filterState;
  const { sorting } = scope.defaultSorting;
  const { rowSelect } = scope.urlFilters;
  function watchAndEmit<T>(
    source: WatchSource<T>,
    event: string,
    componentId: string,
    mapper: (val: T) => Parameters<typeof sendComponentEvent>[2] = (v) => v,
    opts: WatchOptions = {},
  ): void {
    watch(
      source,
      (newVal) => sendComponentEvent(event, componentId, mapper(newVal)),
      { deep: true, ...opts },
    );
  }

  if (componentId) {
    watchAndEmit(columnFilters, TableViewEvents.FILTER_CHANGE, componentId);
    watchAndEmit(sorting, TableViewEvents.SORT_CHANGE, componentId);
    watchAndEmit(
      rowSelect,
      TableViewEvents.ROW_SELECT,
      componentId,
      (selection) => ({
        selectedIds: selectedRowIds(selection),
      }),
    );
  }
  return {};
}

export function useTableViewMount<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "arrival"
    | "rowActions"
    | "quickFilters"
    | "linkCounts"
    | "displayOptions"
  >,
) {
  const { componentId } = scope.configuration;
  const { route } = scope.arrival;
  const { openRowById } = scope.rowActions;
  const { loadRelationQuickFilters } = scope.quickFilters;
  const { refreshLinkTabCounts } = scope.linkCounts;
  const {
    activeDisplayId,
    fallbackDisplayId,
    isConfigRenderedDisplay,
    availableDisplays,
  } = scope.displayOptions;
  const checkUrlParameter = () => {
    const urlParamKey = `${componentId}:id`;
    const itemId = route.query[urlParamKey];

    if (itemId && isString(itemId)) {
      openRowById(itemId);
    }
  };

  onMounted(() => {
    checkUrlParameter();
    void loadRelationQuickFilters();
    void refreshLinkTabCounts();

    if (
      activeDisplayId.value !== fallbackDisplayId &&
      !isConfigRenderedDisplay(activeDisplayId.value) &&
      !availableDisplays.value.some((d) => d.id === activeDisplayId.value)
    ) {
      activeDisplayId.value = fallbackDisplayId;
    }
  });
  return {};
}
