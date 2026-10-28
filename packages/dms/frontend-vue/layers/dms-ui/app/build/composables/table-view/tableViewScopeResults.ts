import type { useTableViewConfiguration } from "./tableViewConfiguration";
import type { useTableViewArrival } from "./tableViewArrival";
import type {
  useTableViewDisplayOptions,
  useTableViewDisplayComponent,
  useTableViewDisplayPreferences,
} from "./tableViewDisplays";
import type {
  useTableViewUrlFilters,
  useTableViewPinnedFilters,
  useTableViewFilterState,
  useTableViewQueryFilters,
} from "./tableViewFilters";
import type {
  useTableViewGroupingOptions,
  useTableViewDefaultSorting,
  useTableViewQuerySorting,
  useTableViewSortRecovery,
} from "./tableViewSorting";
import type { useTableViewViews } from "./tableViewViews";
import type {
  useTableViewTabs,
  useTableViewTabPresentation,
} from "./tableViewTabs";
import type {
  useTableViewRows,
  useTableViewQuery,
  useTableViewListState,
  useTableViewListPagination,
} from "./tableViewListing";
import type { useTableViewQuickFilters } from "./tableViewQuickFilters";
import type {
  useTableViewLiveHold,
  useTableViewRefresh,
} from "./tableViewLive";
import type {
  useTableViewCountsQuery,
  useTableViewCountsData,
  useTableViewLinkCounts,
} from "./tableViewCounts";
import type { useTableViewFooter } from "./tableViewFooter";
import type {
  useTableViewRowNavigation,
  useTableViewRowLocator,
} from "./tableViewNavigation";
import type {
  useTableViewReorder,
  useTableViewGrouping,
} from "./tableViewGrouping";
import type {
  useTableViewRowActions,
  useTableViewRowCommands,
  useTableViewRowOpen,
  useTableViewRowEdit,
} from "./tableViewActions";
import type {
  useTableViewBulkSelection,
  useTableViewDisplaySelection,
} from "./tableViewSelection";
import type { useTableViewRowRealtime } from "./tableViewRealtime";
import type {
  useTableViewPresenceState,
  useTableViewPresenceEvents,
} from "./tableViewPresence";
import type {
  useTableViewExpansion,
  useTableViewExpandedDetails,
} from "./tableViewExpansion";
import type { useTableViewRecordLink } from "./tableViewRecordLink";
import type {
  useTableViewDisplayActions,
  useTableViewDisplayContext,
} from "./tableViewDisplayContext";
import type { useTableViewQuickActions } from "./tableViewQuickActions";
export interface TableViewScopeResults<T extends Data> {
  configuration: ReturnType<typeof useTableViewConfiguration<T>>;
  arrival: ReturnType<typeof useTableViewArrival<T>>;
  displayOptions: ReturnType<typeof useTableViewDisplayOptions<T>>;
  displayComponent: ReturnType<typeof useTableViewDisplayComponent<T>>;
  displayPreferences: ReturnType<typeof useTableViewDisplayPreferences<T>>;
  urlFilters: ReturnType<typeof useTableViewUrlFilters<T>>;
  groupingOptions: ReturnType<typeof useTableViewGroupingOptions<T>>;
  defaultSorting: ReturnType<typeof useTableViewDefaultSorting<T>>;
  pinnedFilters: ReturnType<typeof useTableViewPinnedFilters<T>>;
  filterState: ReturnType<typeof useTableViewFilterState<T>>;
  views: ReturnType<typeof useTableViewViews<T>>;
  tabs: ReturnType<typeof useTableViewTabs<T>>;
  rows: ReturnType<typeof useTableViewRows<T>>;
  quickFilters: ReturnType<typeof useTableViewQuickFilters<T>>;
  queryFilters: ReturnType<typeof useTableViewQueryFilters<T>>;
  querySorting: ReturnType<typeof useTableViewQuerySorting<T>>;
  query: ReturnType<typeof useTableViewQuery<T>>;
  liveHold: ReturnType<typeof useTableViewLiveHold<T>>;
  listState: ReturnType<typeof useTableViewListState<T>>;
  sortRecovery: ReturnType<typeof useTableViewSortRecovery<T>>;
  listPagination: ReturnType<typeof useTableViewListPagination<T>>;
  countsQuery: ReturnType<typeof useTableViewCountsQuery<T>>;
  countsData: ReturnType<typeof useTableViewCountsData<T>>;
  footer: ReturnType<typeof useTableViewFooter<T>>;
  rowNavigation: ReturnType<typeof useTableViewRowNavigation<T>>;
  rowLocator: ReturnType<typeof useTableViewRowLocator<T>>;
  reorder: ReturnType<typeof useTableViewReorder<T>>;
  grouping: ReturnType<typeof useTableViewGrouping<T>>;
  linkCounts: ReturnType<typeof useTableViewLinkCounts<T>>;
  refresh: ReturnType<typeof useTableViewRefresh<T>>;
  tabPresentation: ReturnType<typeof useTableViewTabPresentation<T>>;
  rowActions: ReturnType<typeof useTableViewRowActions<T>>;
  bulkSelection: ReturnType<typeof useTableViewBulkSelection<T>>;
  rowCommands: ReturnType<typeof useTableViewRowCommands<T>>;
  rowOpen: ReturnType<typeof useTableViewRowOpen<T>>;
  rowRealtime: ReturnType<typeof useTableViewRowRealtime<T>>;
  presenceState: ReturnType<typeof useTableViewPresenceState<T>>;
  presenceEvents: ReturnType<typeof useTableViewPresenceEvents<T>>;
  expansion: ReturnType<typeof useTableViewExpansion<T>>;
  expandedDetails: ReturnType<typeof useTableViewExpandedDetails<T>>;
  rowEdit: ReturnType<typeof useTableViewRowEdit<T>>;
  recordLink: ReturnType<typeof useTableViewRecordLink<T>>;
  displaySelection: ReturnType<typeof useTableViewDisplaySelection<T>>;
  displayActions: ReturnType<typeof useTableViewDisplayActions<T>>;
  displayContext: ReturnType<typeof useTableViewDisplayContext<T>>;
  quickActions: ReturnType<typeof useTableViewQuickActions<T>>;
}
export type TableViewScopeReaders<T extends Data> = {
  [K in keyof TableViewScopeResults<T>]: () => TableViewScopeResults<T>[K];
};
