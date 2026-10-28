import { useTableViewConfiguration as createConfiguration } from "./tableViewConfiguration";
import {
  useTableViewArrival as createArrival,
  useTableViewLinkedVisit as createLinkedVisit,
} from "./tableViewArrival";
import {
  useTableViewDisplayOptions as createDisplayOptions,
  useTableViewDisplayComponent as createDisplayComponent,
  useTableViewDisplayPreferences as createDisplayPreferences,
} from "./tableViewDisplays";
import {
  useTableViewUrlFilters as createUrlFilters,
  useTableViewPinnedFilters as createPinnedFilters,
  useTableViewFilterState as createFilterState,
  useTableViewQueryFilters as createQueryFilters,
} from "./tableViewFilters";
import {
  useTableViewGroupingOptions as createGroupingOptions,
  useTableViewDefaultSorting as createDefaultSorting,
  useTableViewQuerySorting as createQuerySorting,
  useTableViewSortRecovery as createSortRecovery,
} from "./tableViewSorting";
import {
  useTableViewViews as createViews,
  useTableViewMobileDisplay as createMobileDisplay,
} from "./tableViewViews";
import {
  useTableViewTabs as createTabs,
  useTableViewTabPresentation as createTabPresentation,
  useTableViewNavBadges as createNavBadges,
} from "./tableViewTabs";
import {
  useTableViewRows as createRows,
  useTableViewQuery as createQuery,
  useTableViewListState as createListState,
  useTableViewListPagination as createListPagination,
} from "./tableViewListing";
import { useTableViewQuickFilters as createQuickFilters } from "./tableViewQuickFilters";
import {
  useTableViewLiveHold as createLiveHold,
  useTableViewRefresh as createRefresh,
} from "./tableViewLive";
import {
  useTableViewCountsQuery as createCountsQuery,
  useTableViewCountsData as createCountsData,
  useTableViewLinkCounts as createLinkCounts,
} from "./tableViewCounts";
import { useTableViewFooter as createFooter } from "./tableViewFooter";
import {
  useTableViewRowNavigation as createRowNavigation,
  useTableViewRowLocator as createRowLocator,
} from "./tableViewNavigation";
import {
  useTableViewReorder as createReorder,
  useTableViewGrouping as createGrouping,
} from "./tableViewGrouping";
import {
  useTableViewRowActions as createRowActions,
  useTableViewRowCommands as createRowCommands,
  useTableViewRowOpen as createRowOpen,
  useTableViewRowEdit as createRowEdit,
} from "./tableViewActions";
import {
  useTableViewBulkSelection as createBulkSelection,
  useTableViewDisplaySelection as createDisplaySelection,
} from "./tableViewSelection";
import {
  useTableViewRowRealtime as createRowRealtime,
  useTableViewRowEvents as createRowEvents,
} from "./tableViewRealtime";
import {
  useTableViewPresenceState as createPresenceState,
  useTableViewPresenceEvents as createPresenceEvents,
} from "./tableViewPresence";
import {
  useTableViewExpansion as createExpansion,
  useTableViewExpandedDetails as createExpandedDetails,
} from "./tableViewExpansion";
import { useTableViewRecordLink as createRecordLink } from "./tableViewRecordLink";
import {
  useTableViewDisplayActions as createDisplayActions,
  useTableViewDisplayContext as createDisplayContext,
} from "./tableViewDisplayContext";
import {
  useTableViewQuickActions as createQuickActions,
  useTableViewShortcuts as createShortcuts,
} from "./tableViewQuickActions";
import {
  useTableViewStatePersistence as createStatePersistence,
  useTableViewSizingPersistence as createSizingPersistence,
} from "./tableViewPersistence";
import {
  useTableViewEvents as createEvents,
  useTableViewMount as createMount,
} from "./tableViewEvents";
import type { TableViewSetupProps } from "./tableViewTypes";
import { TableViewScope } from "./tableViewScope";
import { tableViewBindings } from "./tableViewBindings";
export function useTableViewSetup<T extends Data>(
  props: TableViewSetupProps<T>,
) {
  const scope: TableViewScope<T> = new TableViewScope<T>(props, {
    configuration: () => configuration,
    arrival: () => arrival,
    displayOptions: () => displayOptions,
    displayComponent: () => displayComponent,
    displayPreferences: () => displayPreferences,
    urlFilters: () => urlFilters,
    groupingOptions: () => groupingOptions,
    defaultSorting: () => defaultSorting,
    pinnedFilters: () => pinnedFilters,
    filterState: () => filterState,
    views: () => views,
    tabs: () => tabs,
    rows: () => rows,
    quickFilters: () => quickFilters,
    queryFilters: () => queryFilters,
    querySorting: () => querySorting,
    query: () => query,
    liveHold: () => liveHold,
    listState: () => listState,
    sortRecovery: () => sortRecovery,
    listPagination: () => listPagination,
    countsQuery: () => countsQuery,
    countsData: () => countsData,
    footer: () => footer,
    rowNavigation: () => rowNavigation,
    rowLocator: () => rowLocator,
    reorder: () => reorder,
    grouping: () => grouping,
    linkCounts: () => linkCounts,
    refresh: () => refresh,
    tabPresentation: () => tabPresentation,
    rowActions: () => rowActions,
    bulkSelection: () => bulkSelection,
    rowCommands: () => rowCommands,
    rowOpen: () => rowOpen,
    rowRealtime: () => rowRealtime,
    presenceState: () => presenceState,
    presenceEvents: () => presenceEvents,
    expansion: () => expansion,
    expandedDetails: () => expandedDetails,
    rowEdit: () => rowEdit,
    recordLink: () => recordLink,
    displaySelection: () => displaySelection,
    displayActions: () => displayActions,
    displayContext: () => displayContext,
    quickActions: () => quickActions,
  });
  const configuration = createConfiguration<T>(scope);
  const arrival = createArrival<T>(scope);
  const displayOptions = createDisplayOptions<T>(scope);
  const displayComponent = createDisplayComponent<T>(scope);
  const displayPreferences = createDisplayPreferences<T>(scope);
  const urlFilters = createUrlFilters<T>(scope);
  const groupingOptions = createGroupingOptions<T>(scope);
  const defaultSorting = createDefaultSorting<T>(scope);
  const pinnedFilters = createPinnedFilters<T>(scope);
  const filterState = createFilterState<T>(scope);
  const views = createViews<T>(scope);
  createMobileDisplay<T>(scope);
  const tabs = createTabs<T>(scope);
  createLinkedVisit<T>(scope);
  const rows = createRows<T>(scope);
  const quickFilters = createQuickFilters<T>(scope);
  const queryFilters = createQueryFilters<T>(scope);
  const querySorting = createQuerySorting<T>(scope);
  const query = createQuery<T>(scope);
  const liveHold = createLiveHold<T>(scope);
  const listState = createListState<T>(scope);
  const sortRecovery = createSortRecovery<T>(scope);
  const listPagination = createListPagination<T>(scope);
  const countsQuery = createCountsQuery<T>(scope);
  const countsData = createCountsData<T>(scope);
  const footer = createFooter<T>(scope);
  const rowNavigation = createRowNavigation<T>(scope);
  const rowLocator = createRowLocator<T>(scope);
  const reorder = createReorder<T>(scope);
  const grouping = createGrouping<T>(scope);
  const linkCounts = createLinkCounts<T>(scope);
  const refresh = createRefresh<T>(scope);
  const tabPresentation = createTabPresentation<T>(scope);
  createNavBadges<T>(scope);
  const rowActions = createRowActions<T>(scope);
  const bulkSelection = createBulkSelection<T>(scope);
  const rowCommands = createRowCommands<T>(scope);
  const rowOpen = createRowOpen<T>(scope);
  const rowRealtime = createRowRealtime<T>(scope);
  createRowEvents<T>(scope);
  const presenceState = createPresenceState<T>(scope);
  const presenceEvents = createPresenceEvents<T>(scope);
  const expansion = createExpansion<T>(scope);
  const expandedDetails = createExpandedDetails<T>(scope);
  const rowEdit = createRowEdit<T>(scope);
  const recordLink = createRecordLink<T>(scope);
  const displaySelection = createDisplaySelection<T>(scope);
  const displayActions = createDisplayActions<T>(scope);
  const displayContext = createDisplayContext<T>(scope);
  const quickActions = createQuickActions<T>(scope);
  createShortcuts<T>(scope);
  createStatePersistence<T>(scope);
  createSizingPersistence<T>(scope);
  createEvents<T>(scope);
  createMount<T>(scope);
  return tableViewBindings(scope);
}
