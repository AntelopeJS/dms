import { keptViewId } from "./useTableViews";
import { useTablePreferences } from "./useTablePreferences";
import {
  isLinkedArrival,
  linkedArrivalPreferences,
  linkFollowingPreferences,
  linkKeyScope,
  urlFilterScope,
} from "./utils/linkedArrival";
import { pageArrivalKind } from "./utils/pageArrival";
import { useTableLinkedVisit } from "./useTableLinkedVisit";
import { readTableUrlTab } from "./useTableUrlTab";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewArrival<T extends Data>(
  scope: Pick<TableViewScope<T>, "configuration" | "props" | "deferred">,
) {
  const { componentId, pageId, queryParamFilters } = scope.configuration;
  const { props } = scope;
  const { deferred } = scope;
  const route = useDmsRoute();
  const urlScope = {
    tableId: props.tableId,
    isSoleTableView: props.isSoleTableView,
  };
  const ALL_TAB_ID = "all";

  const keptPreferences = useTablePreferences(componentId, pageId);

  const isLinked = isLinkedArrival({
    query: route.query,
    urlScope,
    queryParamFilters,
    isVisit: pageArrivalKind() === "visit",
    rememberedTab: keptPreferences.get<string>("activeTab", ALL_TAB_ID),
    keptLinkScope: keptPreferences.get<string | undefined>(
      "linkScope",
      undefined,
    ),
    shownLink: keptPreferences.get<string | undefined>("shownLink", undefined),
  });
  const tablePreferences = linkFollowingPreferences(
    isLinked ? linkedArrivalPreferences(keptPreferences) : keptPreferences,
    {
      isLinkedArrival: isLinked,
      urlScope,
      linkScope: () => urlFilterScope(route.query, queryParamFilters),
      linkKeys: () => linkKeyScope(route.query, urlScope, queryParamFilters),

      listingState: () => [
        ["activeView", keptViewId(deferred.activeViewId.value), undefined],
        ["activeTab", deferred.activeTabId.value, ALL_TAB_ID],
        ["columnFilters", deferred.columnFilters.value, []],
        ["sorting", deferred.sorting.value, deferred.defaultSortState],
        [
          "pagination",
          deferred.paginationState.value,
          deferred.DEFAULT_PAGINATION,
        ],
        ["paginationScope", undefined, undefined],
      ],
    },
  );
  onMounted(() => void tablePreferences.settleArrival());
  const { sendComponentEvent } = useComponentEvent(componentId);
  const { processI18n } = useTranslation();
  return {
    processI18n,
    tablePreferences,
    route,
    urlScope,
    ALL_TAB_ID,
    sendComponentEvent,
  };
}

export function useTableViewLinkedVisit<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "arrival" | "configuration" | "views" | "tabs"
  >,
) {
  const { route, urlScope, tablePreferences, ALL_TAB_ID } = scope.arrival;
  const { queryParamFilters } = scope.configuration;
  const { activeViewId, tableViewItems, openLinkedView } = scope.views;
  const { activeTabId, isOpenableTab, resolvedTabs } = scope.tabs;
  useTableLinkedVisit({
    route,
    urlScope,
    queryParamFilters,
    activeView: () => activeViewId.value,
    activeTab: () => activeTabId.value,
    canOpenView: (id) => tableViewItems.value.some((view) => view.id === id),
    canOpenTab: isOpenableTab,
    follow: (query) => {
      void tablePreferences.followLink(() => {
        openLinkedView(query);
        const tab = readTableUrlTab(query, urlScope);
        activeTabId.value = tab && isOpenableTab(tab) ? tab : ALL_TAB_ID;
      });
    },
  });

  watch(resolvedTabs, (next) => {
    if (next.length === 0) return;
    if (!next.some((tab) => !tab.to && tab.id === activeTabId.value)) {
      activeTabId.value = ALL_TAB_ID;
    }
  });
  return {};
}
