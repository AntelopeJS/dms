import type { TableViewTab } from "../../../composables/table-view/types";
import { useNavBadges } from "../navigation/useNavBadges";
import { usePermissionPreview } from "#dms-core/app/entries/composables/auth/usePermissionPreview";
import { readTableUrlTab, useTableUrlTab } from "./useTableUrlTab";
import { navBadgeCount } from "./utils/tableCounts";
import type { TableViewScope } from "./tableViewScope";

export interface ResolvedTab {
  id: string;
  label: string;
  filters: TableFilter[];
  icon?: string;
  textColor?: string;
  iconColor?: string;
  /** Link tab: the page it opens. */
  to?: string;
  toPage?: string;
  countFrom?: string;
  navBadge?: TableViewTab["navBadge"];
}
export function useTableViewTabs<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "arrival" | "configuration" | "displayComponent"
  >,
) {
  const { route, urlScope, tablePreferences, ALL_TAB_ID, processI18n } =
    scope.arrival;
  const { tabs } = scope.configuration;
  const { activeCapabilities } = scope.displayComponent;
  const { t, te, locale } = useI18n();

  const activeTabId = ref<string>(
    readTableUrlTab(route.query, urlScope) ??
      tablePreferences.get<string>("activeTab", ALL_TAB_ID),
  );

  const hasConfiguredAllTab = (tabs ?? []).some((tab) => tab.id === ALL_TAB_ID);

  const resolvedTabs = computed<ResolvedTab[]>(() => {
    if (!activeCapabilities.value.tabs) return [];
    if (!tabs || tabs.length === 0) return [];
    const implicitAll: ResolvedTab[] = hasConfiguredAllTab
      ? []
      : [{ id: ALL_TAB_ID, label: t("dms.table.tabs.all"), filters: [] }];
    return [
      ...implicitAll,
      ...tabs.map((tab) => ({
        id: tab.id,
        label: processI18n(tab.label),

        filters: tab.filter && !tab.to ? [{ ...tab.filter }] : [],
        icon: tab.icon,
        textColor: tab.textColor,
        iconColor: tab.iconColor,
        to: tab.to,
        toPage: tab.toPage,
        countFrom: tab.countFrom,
        navBadge: tab.navBadge,
      })),
    ];
  });

  const activeTabFilters = computed<TableFilter[]>(() => {
    const tab = resolvedTabs.value.find((t) => t.id === activeTabId.value);
    return tab?.filters || [];
  });

  const isOpenableTab = (tabId: string) =>
    resolvedTabs.value.some((tab) => !tab.to && tab.id === tabId);

  useTableUrlTab({
    route,
    urlScope,
    activeTabId,
    isOpenable: isOpenableTab,
  });
  return {
    activeTabId,
    isOpenableTab,
    resolvedTabs,
    t,
    activeTabFilters,
    te,
    locale,
  };
}

export function useTableViewTabPresentation<T extends Data>(
  scope: Pick<TableViewScope<T>, "countsData" | "linkCounts" | "tabs">,
) {
  const { tabCountsData, areCountsPending } = scope.countsData;
  const { linkTabCountsLoaded, linkTabCounts } = scope.linkCounts;
  const { resolvedTabs } = scope.tabs;
  const permissionPreview = usePermissionPreview();
  const previewSiteLayout = useSiteLayout();
  const linkTabPreviewState = (tab: ResolvedTab) => {
    if (!tab.to || !permissionPreview.isActive.value) return null;
    const fullId =
      tab.toPage ??
      previewSiteLayout.findMatchingRoute(stripQueryAndHash(tab.to))?.metadata
        .fullId;
    return permissionPreview.entryState(fullId);
  };

  const isTabCountPending = (tab: ResolvedTab): boolean => {
    if (!tab.to) return areCountsPending.value;
    return !!tab.countFrom && !linkTabCountsLoaded.value;
  };

  const tabsWithCount = computed(() =>
    resolvedTabs.value.map((tab) => ({
      id: tab.id,
      label: tab.label,
      count: tab.to
        ? linkTabCounts.value[tab.id]
        : tabCountsData.value?.[tab.id],
      countPending: isTabCountPending(tab),
      icon: tab.icon,
      textColor: tab.textColor,
      iconColor: tab.iconColor,
      to: tab.to,
      previewLocked: linkTabPreviewState(tab) === "hidden",
      previewPartial: linkTabPreviewState(tab) === "partial",
    })),
  );
  return { tabsWithCount };
}

export function useTableViewNavBadges<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "countsData" | "countsQuery" | "tabPresentation" | "tabs" | "configuration"
  >,
) {
  const { tabCountsData } = scope.countsData;
  const { isCountStateNarrowed } = scope.countsQuery;
  const { tabsWithCount } = scope.tabPresentation;
  const { resolvedTabs } = scope.tabs;
  const { pageId } = scope.configuration;
  const { setNavBadge } = useNavBadges();
  const tabNavBadgeCount = (tab: ResolvedTab, count: number | undefined) =>
    tab.to
      ? count
      : navBadgeCount(tabCountsData.value, tab.id, isCountStateNarrowed.value);
  watch(
    tabsWithCount,
    (next) => {
      for (const tab of next) {
        const source = resolvedTabs.value.find((entry) => entry.id === tab.id);
        if (!source?.navBadge) continue;
        const count = tabNavBadgeCount(source, tab.count);
        if (count === undefined) continue;
        const fullId = source.to ? source.toPage : pageId;
        const tone =
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The shared isObject guard widens the navBadge owner's tone to unknown; typeof preserves its public options union without asserting validation.
          typeof source.navBadge === "object"
            ? source.navBadge.tone
            : undefined;
        if (fullId) {
          setNavBadge(fullId, count > 0 ? String(count) : "", tone);
        }
      }
    },
    { immediate: true },
  );
  return {};
}
