import { refDebounced } from "@vueuse/core";
import type { TableViewListResponse } from "../../../composables/table-view/types";
import {
  buildTableCountQueries,
  isCountNarrowed,
  VIEW_COUNT_ID_PREFIX,
  type TableCountState,
} from "./utils/tableCounts";
import { viewFilters } from "./utils/views";
import { type TableViewItem } from "../../components/table/Views.vue";
import { useTableCountsData } from "./useTableListData";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewCountsQuery<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "urlFilters" | "tabs" | "querySorting" | "views" | "pinnedFilters"
  >,
) {
  const { queryParamHiddenFilters, routeParamHiddenFilters } = scope.urlFilters;
  const { activeTabFilters, resolvedTabs } = scope.tabs;
  const { effectiveColumnFilters, effectiveGlobalFilter } = scope.querySorting;
  const { tableViewItems, activeViewId } = scope.views;
  const { pinnedDefaultFilters } = scope.pinnedFilters;
  const scopeFilters = computed<TableFilter[]>(() => [
    ...queryParamHiddenFilters.value,
    ...routeParamHiddenFilters.value,
  ]);
  const countState = computed<TableCountState>(() => ({
    scopeFilters: scopeFilters.value,
    tabFilters: activeTabFilters.value,
    columnFilters: effectiveColumnFilters.value,
    search: effectiveGlobalFilter.value,
  }));
  const isCountStateNarrowed = computed(() =>
    isCountNarrowed(countState.value),
  );

  const COUNTS_DEBOUNCE_MS = 200;
  const debouncedCountsQuery = refDebounced(
    computed(() =>
      buildTableCountQueries({
        ...countState.value,
        tabs: resolvedTabs.value
          .filter((tab) => !tab.to)
          .map((tab) => ({
            id: tab.id,
            filters: tab.filters,
            hasNavBadge: !!tab.navBadge,
          })),
        views: tableViewItems.value
          .filter((view) => view.count)
          .map((view) => ({
            id: view.id,
            filters: viewFilters(view, pinnedDefaultFilters),
            search: view.search,
          })),
        activeViewId: activeViewId.value,
      }),
    ),
    COUNTS_DEBOUNCE_MS,
  );
  const tabCountsQuery = computed(() => debouncedCountsQuery.value);
  return { tabCountsQuery, isCountStateNarrowed };
}

export function useTableViewCountsData<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rows"
    | "countsQuery"
    | "query"
    | "liveHold"
    | "views"
    | "props"
  >,
) {
  const { componentId, pageId } = scope.configuration;
  const { tableRows } = scope.rows;
  const { tabCountsQuery } = scope.countsQuery;
  const { archiveQuery } = scope.query;
  const { liveHold } = scope.liveHold;
  const { tableViewItems, canSaveViews } = scope.views;
  const { props } = scope;
  const { data: tabCountsData, refresh: refreshTabCounts } =
    useTableCountsData<T>({
      componentId,
      pageId,
      rows: tableRows,
      queries: tabCountsQuery,
      archiveQuery,
      heldQuery: liveHold.heldQuery,
    });

  const viewItems = computed<TableViewItem[]>(() =>
    tableViewItems.value.map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.icon,
      tone: view.tone,
      dot: view.dot,
      isUserView: view.isUserView,
      count: view.count
        ? tabCountsData.value?.[`${VIEW_COUNT_ID_PREFIX}${view.id}`]
        : undefined,
      countPending: !!view.count && tabCountsData.value == null,
    })),
  );
  const viewsLayout = props.views?.layout ?? "tabs";
  const hasViews =
    !!props.views && (props.views.items.length > 0 || canSaveViews);
  return { refreshTabCounts, tabCountsData, viewItems, viewsLayout, hasViews };
}

export function useTableViewLinkCounts<T extends Data>(
  scope: Pick<TableViewScope<T>, "tabs" | "rows">,
) {
  const { resolvedTabs } = scope.tabs;
  const { $authFetch } = scope.rows;
  const linkTabCounts = ref<Record<string, number>>({});

  const linkTabCountsLoaded = ref(false);
  const LINK_TAB_COUNT_QUERY = { limit: 1, offset: 0 };

  const refreshLinkTabCounts = async () => {
    const linked = resolvedTabs.value.filter((tab) => tab.to && tab.countFrom);
    if (linked.length === 0) {
      linkTabCountsLoaded.value = true;
      return;
    }
    const entries = await Promise.all(
      linked.map(async (tab) => {
        try {
          const response = await $authFetch<TableViewListResponse<unknown>>(
            `${tab.countFrom}/list`,
            { query: LINK_TAB_COUNT_QUERY },
          );
          return [tab.id, response.total] as const;
        } catch {
          return undefined;
        }
      }),
    );
    linkTabCounts.value = Object.fromEntries(
      entries.filter((entry) => entry !== undefined),
    );
    linkTabCountsLoaded.value = true;
  };
  return { refreshLinkTabCounts, linkTabCountsLoaded, linkTabCounts };
}
