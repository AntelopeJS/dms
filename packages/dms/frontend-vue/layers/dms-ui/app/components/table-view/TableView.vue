<script setup lang="ts" generic="T extends Data">
import { get } from "@nuxt/ui/runtime/utils/index.js";
import DmsBlockStatus from "../../build/components/blocks/BlockStatus.vue";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";
import type {
  ColumnSizingState,
  ExpandedState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/vue-table";
import {
  refDebounced,
  until,
  useActiveElement,
  watchDebounced,
} from "@vueuse/core";
import {
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
  type QuickActionIntent,
  readQuickActionIntent,
} from "../../types/quick-actions";
import { registerQuickActionTarget } from "../../build/utils/quickActionTargets";
import type {
  KanbanConfig,
  TableViewConfig,
  TableViewExpandableConfig,
  TableViewFooter,
  TableViewQuickFilter,
  TableViewListResponse,
  TableViewDisplayContext,
  TableViewDisplayConfig,
  TableViewExpandedRowProps,
  TableViewViewsConfig,
  TableViewGroupedConfig,
  TableViewEmptyStatesConfig,
  TableViewPaginationMode,
  TableViewSourceConfig,
  TableViewReorderConfig,
  TableViewTab,
} from "../../composables/table-view/types";
import {
  TABLE_DISPLAY_ID,
  CARDS_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
  TableViewEvents,
} from "../../composables/table-view/types";
import {
  isEligibleKanbanColumn,
  KANBAN_DISPLAY_BRIDGE_KEY,
} from "../../composables/table-view/kanban";
import { useTableRowActions } from "../../build/composables/table-view/useTableViewRowActions";
import { describeTableWriteError } from "../../build/composables/table-view/utils/writeError";
import {
  buildTableQuery,
  isFilterEffective,
} from "../../build/composables/table-view/utils/tableQuery";
import { buildTableViewShortcuts } from "../../composables/table-view/shortcuts";
import {
  expandedRowsOnListing,
  type ExpandedRowMap,
  nextExpandedRows,
} from "../../build/composables/table-view/utils/expandedRows";
import { resolveTableChrome } from "../../build/composables/table-view/utils/chrome";
import {
  isSameSorting,
  isUnsortableFieldError,
  defaultSortingState,
  resolveDefaultSortConfig,
  sanitizeSorting,
  sortingOrDefault,
  sortableColumnIds,
  sortValueKind,
} from "../../build/composables/table-view/utils/sortableColumns";
import { selectedRowIds } from "../../build/composables/table-view/utils/bulkActions";
import { isBulkAction } from "../../build/composables/actions/bulkSelection";
import { selectionScopeKey } from "../../build/utils/selectionScope";
import {
  isDeepLinkAction,
  resolveDeepLinkedRow,
} from "../../build/composables/table-view/utils/recordLink";
import {
  rowSidePanelOwnerKey,
  useRowSidePanelContent,
} from "#dms-layout/app/build/composables/layout/rowSidePanel";
import type { CustomRowAction } from "../../types/row-action";
import {
  type QuickFilterItem,
  quickFilterMode,
  relationQuickFilterItems,
  relationQuickFilterSource,
  type ResolvedQuickFilter,
  staticQuickFilterItems,
} from "../../build/composables/table-view/utils/quickFilters";
import { useNavBadges } from "../../build/composables/navigation/useNavBadges";
import {
  resolveRowClickAction,
  rowCustomActions,
} from "../../utils/rowClickAction";
import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import type { RowActionRule } from "#dms-core/app/types/row-action";

import UTable from "../../build/components/table/Table.vue";
import ExpandedRowDetail from "../../build/components/table-view/ExpandedRowDetail.vue";
import { buildExpandedRowProps } from "../../build/composables/table-view/utils/expandedRowProps";
import {
  type ExpandedRowLoadState,
  useExpandedRowDetails,
} from "../../build/composables/table-view/useExpandedRowDetails";
import type {
  TableAccumulation,
  TableUrlFilter,
  TableViewSwitcherItem,
} from "../../build/components/table/Table.vue";
import {
  currentQuery,
  visibleUrlFilters,
  withoutQueryParam,
} from "../../build/composables/table-view/utils/urlFilters";
import {
  defineAsyncComponent,
  useTemplateRef,
  type Component,
  type ComponentPublicInstance,
  type WatchOptions,
  type WatchSource,
} from "vue";
import { useTableViewConfig } from "../../build/composables/table-view/useTableViewConfig";
import {
  keptViewId,
  useTableViews,
} from "../../build/composables/table-view/useTableViews";
import { useGroupedRows } from "../../build/composables/table-view/useGroupedRows";
import { useTableFooter } from "../../build/composables/table-view/useTableFooter";
import { useAccumulatedPages } from "../../build/composables/table-view/useAccumulatedPages";
import type { RowStep } from "../../build/composables/actions/rowNavigation";
import { rowLocator } from "../../build/composables/table-view/utils/locateRow";
import { usePersistedPagination } from "../../build/composables/table-view/usePersistedPagination";
import { useTablePreferences } from "../../build/composables/table-view/useTablePreferences";
import {
  isLinkedArrival,
  linkedArrivalPreferences,
  linkFollowingPreferences,
  linkKeyScope,
  urlFilterScope,
} from "../../build/composables/table-view/utils/linkedArrival";
import { pageArrivalKind } from "../../build/composables/table-view/utils/pageArrival";
import { useTableLinkedVisit } from "../../build/composables/table-view/useTableLinkedVisit";
import { useMobileDisplay } from "../../build/composables/table-view/useMobileDisplay";
import type { Ref } from "vue";
import type { TableField } from "#dms-core/app/build/composables/user/tablePreferences";
import { useTableRows } from "../../build/composables/table-view/useTableRows";
import { useRefreshTriggers } from "../../build/composables/blocks/useRefreshTriggers";
import { refreshPageBlocks } from "../../utils/blockRefresh";
import { useTableLiveHold } from "../../build/composables/table-view/useTableLiveHold";
import type { TableViewLiveHoldOptions } from "../../types/live";
import { usePageLive } from "../../composables/live/usePageLive";
import LiveHoldBanner from "../../build/components/table-view/LiveHoldBanner.vue";
import { useTableReorder } from "../../build/composables/table-view/useTableReorder";
import {
  groupedOptionsFor,
  listTableSorting,
  orderGroupedRows,
  pickedTableSorting,
  type TableSortingInput,
  isGroupableColumn,
} from "../../build/composables/table-view/utils/groupedRows";
import {
  readTableUrlTab,
  useTableUrlTab,
} from "../../build/composables/table-view/useTableUrlTab";
import {
  buildTableCountQueries,
  isCountNarrowed,
  navBadgeCount,
  VIEW_COUNT_ID_PREFIX,
  type TableCountState,
} from "../../build/composables/table-view/utils/tableCounts";
import { viewFilters } from "../../build/composables/table-view/utils/views";
import { useTableRecordLink } from "../../build/composables/table-view/useTableRecordLink";
import TableViews, {
  type TableViewItem,
} from "../../build/components/table/Views.vue";
import {
  useTableCountsData,
  useTableListData,
} from "../../build/composables/table-view/useTableListData";
import { useTableDataChanges } from "../../composables/table-view/useTableDataChanges";

const REALTIME_ROW_TOPIC_PREFIX = "tableview:row:";
const REALTIME_PRESENCE_TOPIC_PREFIX = "tableview:presence:";
const ROW_ID_DEFAULT_KEY = "_id";
const KanbanDisplay = defineAsyncComponent(() => import("./KanbanDisplay.vue"));

const REALTIME_EVENT_TYPE = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  ACQUIRED: "acquired",
  RELEASED: "released",
  SNAPSHOT: "snapshot",
} as const;

interface RealtimePresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  sessionId: string;
  since?: number;
}

type RealtimePresenceMap = Record<string, RealtimePresenceActor[]>;

/** A kept field of the table, its state, and its default. */
// The default may move once mounted (a phone's display): read when written.
type TableStatePreference = [TableField, Ref<unknown>, unknown];

// The backend options of a table view, declared here as well so the
// component's runtime props never depend on resolving the imported config.
interface TableViewProps<T extends Data> extends TableViewConfig<T> {
  /** Expandable rows: caret column + detail band (backend `expandable`). */
  expandable?: TableViewExpandableConfig;
  /** Caption count while the archived rows show (backend `archivedCountLabel`). */
  archivedCountLabel?: string;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /** Key opening the search (`defineShortcuts` notation); `shift_f` else. */
  searchShortcut?: string;
  /** One-click dropdown filters of the toolbar. */
  quickFilters?: TableViewQuickFilter[];
  /** Rows per page while the user picked none. */
  pageSize?: number;
  /** How the rows beyond the first page are reached. */
  pagination?: TableViewPaginationMode;
  /** A `TableView.fromSource` table's route, instead of a data controller. */
  source?: TableViewSourceConfig;
  /** Rows ordered by hand on a number column (backend `reorder`). */
  reorder?: TableViewReorderConfig;
  /** Rows listed first whatever the sort (backend `pinnedRows`). */
  pinnedRows?: RowActionRule;
  /** Footer texts and figures: row count, hint, summaries and legend. */
  footer?: TableViewFooter;
  /** What the empty body says, per reason it is empty. */
  emptyStates?: TableViewEmptyStatesConfig;
  /** Named states of the table (backend `views`). */
  views?: TableViewViewsConfig;
  /** Key of the table view in its page, prefixing its URL keys. */
  tableId?: string;
  /** The page carries no other table view: `?view=` / `?tab=` are its own. */
  isSoleTableView?: boolean;
  /** Topics whose events make the table read its rows again. */
  realtimeTopic?: string | string[];
  /** Keeps the rows while the live page is paused (backend `liveHold`). */
  liveHold?: boolean | TableViewLiveHoldOptions;
}

const props = defineProps<TableViewProps<T>>();

const {
  allColumns,
  listableColumns,
  initialVisibility,
  tableProps,
  location,
  caption,
  labelKey,
  enableTableExport,
  archiveMode,
  defaultFilters,
  customButtons,
  formComponents,
  formContainer,
  formPages,
  componentId,
  pageId,
  defaultSort,
  queryParamFilters,
  routeParamFilters,
  routeParams,
  tabs,
  resolvedDisplays,
  defaultDisplay,
} = useTableViewConfig<T>(props);

const route = useDmsRoute();
const urlScope = {
  tableId: props.tableId,
  isSoleTableView: props.isSoleTableView,
};
const ALL_TAB_ID = "all";

const keptPreferences = useTablePreferences(componentId, pageId);
// A link naming a view, a tab, a record or a URL filter opens on the table's
// defaults plus what it names, never over the state kept from the last visit
// (which stays kept for the next plain visit), until the user makes the
// state shown their own: a view, a tab, a filter or a sort they pick. Only a
// reload (or Back) of the URL the table wrote for that state restores it.
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
    // Read once the table is mounted, past the declarations below. A page
    // kept without its scope is restored as it is (`usePersistedPagination`).
    listingState: () => [
      ["activeView", keptViewId(activeViewId.value), undefined],
      ["activeTab", activeTabId.value, ALL_TAB_ID],
      ["columnFilters", columnFilters.value, []],
      ["sorting", sorting.value, defaultSortState],
      ["pagination", paginationState.value, DEFAULT_PAGINATION],
      ["paginationScope", undefined, undefined],
    ],
  },
);
onMounted(() => void tablePreferences.settleArrival());
const { sendComponentEvent } = useComponentEvent(componentId);
const { processI18n } = useTranslation();

const kanbanEligibleColumns = allColumns.filter(isEligibleKanbanColumn);
const kanbanGroupByOptions = kanbanEligibleColumns.map((column) => ({
  label: processI18n(column.header),
  value: column.accessorKey,
}));

const { displays: registeredDisplays, getById } = useTableViewDisplays();

const offeredDisplayIds = new Set(resolvedDisplays.map((d) => d.id));
// Where a stale or unavailable choice lands: the grid, unless the table view
// drops it, then its default display.
const fallbackDisplayId = offeredDisplayIds.has(TABLE_DISPLAY_ID)
  ? TABLE_DISPLAY_ID
  : defaultDisplay;
const resolvedDisplay = (id: string): TableViewDisplayConfig | undefined =>
  resolvedDisplays.find((d) => d.id === id);
const optionsForDisplay = (id: string): Record<string, unknown> | undefined =>
  resolvedDisplay(id)?.options;
const kanbanOptions = optionsForDisplay(KANBAN_DISPLAY_ID) as
  | KanbanConfig
  | undefined;
const groupedOptions = optionsForDisplay(GROUPED_DISPLAY_ID) as
  | TableViewGroupedConfig
  | undefined;

// Stored under the legacy "viewMode" key (free migration of "table"/"kanban");
// clamped to the offered set so a stale/removed id never renders an un-offered display.
const persistedDisplay = tablePreferences.get<string>(
  "viewMode",
  defaultDisplay,
);
// A default display that draws its whole interface (no table chrome, hence no
// switcher) is the only way into the page: a saved choice cannot override it.
const isDefaultDisplayStandalone =
  resolvedDisplay(defaultDisplay)?.capabilities?.header === false;
const activeDisplayId = ref<string>(
  isDefaultDisplayStandalone
    ? defaultDisplay
    : offeredDisplayIds.has(persistedDisplay)
      ? persistedDisplay
      : fallbackDisplayId,
);

/** A display the backend config renders by itself, with no client plugin. */
const isConfigRenderedDisplay = (id: string): boolean =>
  !!resolvedDisplay(id)?.component;

const availableDisplays = computed<TableViewSwitcherItem[]>(() =>
  registeredDisplays.value
    .filter((display) => offeredDisplayIds.has(display.id))
    .filter(
      (display) =>
        !display.isAvailable ||
        display.isAvailable({
          columns: allColumns,
          options: optionsForDisplay(display.id),
        }),
    )
    .map(({ id, label, icon }) => ({ id, label, icon })),
);

// SSR-safe: capabilities + self-managed flag come from config, not the
// client-only registry, so the chrome and list-query decision match across SSR.
// A hand-ordered table is listed by its position: no sort to pick.
const reorderConfig = props.reorder;
const activeCapabilities = computed(() => {
  const capabilities = resolveDisplayCapabilities(
    resolvedDisplay(activeDisplayId.value)?.capabilities,
  );
  return reorderConfig ? { ...capabilities, sorting: false } : capabilities;
});

const isActiveDisplaySelfManaged = computed(
  () => !!resolvedDisplay(activeDisplayId.value)?.selfManagedData,
);

// Static fallback for built-in displays whose config entry carries options but
// no component (kanban); the registry confirms the same component client-side.
const STATIC_DISPLAY_COMPONENTS: Record<string, Component> = {
  [KANBAN_DISPLAY_ID]: KanbanDisplay,
};

const resolveDisplayComponentRef = (
  component: Component | ComponentInfo | undefined,
): Component | string | undefined => {
  if (!component) return undefined;
  if (typeof component === "object" && "componentName" in component) {
    const name = component.componentName;
    return name ? resolveDmsComponent(name) || name : undefined;
  }
  return component;
};

const activeDisplayComponent = computed<Component | string | undefined>(() => {
  const id = activeDisplayId.value;
  if (id === TABLE_DISPLAY_ID || !offeredDisplayIds.has(id)) return undefined;
  // The instance's own component wins over the registered one: the server
  // renders it, so the client must hydrate the same tree.
  const fromConfig = resolvedDisplay(id)?.component;
  if (fromConfig) return resolveDisplayComponentRef(fromConfig);
  const registered = getById(id)?.component;
  if (registered) return resolveDisplayComponentRef(registered);
  return STATIC_DISPLAY_COMPONENTS[id];
});

const defaultKanbanGroupBy = kanbanOptions?.groupByField ?? "";
const kanbanGroupBy = ref<string>(defaultKanbanGroupBy);
// A saved preference may point to a column that no longer exists or is no
// longer eligible after a backend config change.
tablePreferences.restore(
  "kanbanGroupBy",
  kanbanGroupBy,
  (field) =>
    !kanbanOptions ||
    kanbanEligibleColumns.some((c) => c.accessorKey === field),
);

const DEFAULT_DENSITY = "default";
// The module's density is the default; the user's pick in the ⋯ menu is kept
// with the rest of the table's state.
const defaultDensity = props.density ?? DEFAULT_DENSITY;
const density = ref<"default" | "compact">(defaultDensity);
tablePreferences.restore("density", density);

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGINATION: PaginationState = {
  pageIndex: 0,
  pageSize: props.pageSize ?? DEFAULT_PAGE_SIZE,
};
const resolvedChrome = resolveTableChrome(props.layout, {
  hasCaption: !!caption,
  isSearchable: !!props.searchable,
  isFilterable: allColumns.some((column) => column.enableColumnFilter),
});
const GLOBAL_FILTER_DEBOUNCE_MS = 400;

const DEFAULT_FILTER_MODE = "is";

const queryParamHiddenFilters = computed<TableFilter[]>(() => {
  if (!queryParamFilters) return [];

  return Object.entries(queryParamFilters)
    .filter(([param]) => route.query[param] !== undefined)
    .map(([param, config]) => ({
      accessorKey: config.field,
      mode: config.mode || DEFAULT_FILTER_MODE,
      value: route.query[param] as string,
    }));
});

const shownUrlFilters = computed<TableUrlFilter[]>(() =>
  visibleUrlFilters(queryParamFilters, route.query as Record<string, unknown>),
);

// Rebuilt from the URL the browser shows: a `?record=` a closed drawer
// removed in place must not come back with the visit.
const removeUrlFilter = (param: string) =>
  router.replace({
    query: withoutQueryParam(currentQuery(route.query), param),
  });

const routeParamHiddenFilters = computed<TableFilter[]>(() => {
  if (!routeParamFilters || !routeParams) return [];

  return Object.entries(routeParamFilters)
    .filter(([param]) => routeParams[param] !== undefined)
    .map(([param, config]) => ({
      accessorKey: config.field,
      mode: config.mode || DEFAULT_FILTER_MODE,
      value: routeParams[param] as string,
    }));
});

// A hidden filter's value changed with the URL, in place or through a
// remount: the page reached among the previous rows lists from page 1.
const paginationState = usePersistedPagination({
  preferences: tablePreferences,
  defaults: DEFAULT_PAGINATION,
  scope: () => [queryParamHiddenFilters.value, routeParamHiddenFilters.value],
});
const rowSelect = ref<RowSelectionState>({});
// A column's grid header, for the sort messages.
const columnLabel = (id: string): string => {
  const column = allColumns.find((c) => (c.id ?? c.accessorKey) === id);
  return column ? processI18n(column.header) : id;
};

// The list route sorts on one `@Sortable()` column and refuses any other key
// with a 400 that would leave the table on its error panel: every sort it is
// sent (default, saved, pasted, picked) is checked against the columns first.
const declaredSortableIds = sortableColumnIds(allColumns);
// Columns the route refused although declared sortable (see the recovery
// below): a backend change since the page loaded.
const refusedSortIds = ref<string[]>([]);
const sortableIds = computed(
  () =>
    new Set(
      [...declaredSortableIds].filter(
        (id) => !refusedSortIds.value.includes(id),
      ),
    ),
);

// The grouped display's column, picked in the options menu as the kanban's
// is: the rows of a group follow each other only when the route sorts on it.
const groupedGroupByOptions = groupedOptions
  ? allColumns
      .filter(
        (column) =>
          column.accessorKey === groupedOptions.groupByField ||
          (isGroupableColumn(column) &&
            declaredSortableIds.has(column.accessorKey)),
      )
      .map((column) => ({
        label: processI18n(column.header),
        value: column.accessorKey,
      }))
  : [];
const defaultGroupedGroupBy = groupedOptions?.groupByField ?? "";
const groupedGroupBy = ref<string>(defaultGroupedGroupBy);
tablePreferences.restore(
  "groupedGroupBy",
  groupedGroupBy,
  (field) =>
    !groupedOptions || groupedGroupByOptions.some((o) => o.value === field),
);
const activeGroupedOptions = computed<TableViewGroupedConfig | undefined>(
  () =>
    groupedOptions &&
    groupedOptionsFor(groupedOptions, groupedGroupBy.value, allColumns),
);
// The declared default sort when the route accepts it; without one, the
// sortable creation date, newest first, rather than the database's natural
// order (see `resolveDefaultSortConfig`).
const tableDefaultSort = resolveDefaultSortConfig(
  defaultSort,
  declaredSortableIds,
  import.meta.env.DEV ? (message) => console.warn(message) : undefined,
);
const defaultSortState: SortingState = defaultSortingState(tableDefaultSort);
// The toolbar sort menu names the default sort even when its field is not a
// displayed column.
const defaultSortLabel = tableDefaultSort
  ? columnLabel(tableDefaultSort.field)
  : undefined;
const defaultSortKind = tableDefaultSort
  ? sortValueKind(
      allColumns.find((c) => (c.id ?? c.accessorKey) === tableDefaultSort.field)
        ?.type?.id,
    )
  : undefined;
// A hand-ordered table has no sort to pick: a sort saved before it was
// ordered by hand is not read back.
const sorting = ref<SortingState>(
  reorderConfig
    ? defaultSortState
    : sortingOrDefault(
        tablePreferences.get<SortingState>("sorting", defaultSortState),
        declaredSortableIds,
        defaultSortState,
      ),
);

const savedFilters = tablePreferences.get<TableFilter[]>("columnFilters", []);

const buildPinnedFilters = (): TableFilter[] =>
  (defaultFilters || []).map((def) => {
    const saved = savedFilters.find((f) => f.accessorKey === def.accessorKey);
    return {
      accessorKey: def.accessorKey,
      mode: def.mode,
      value: saved ? saved.value : def.value,
      pinned: true,
      initialValue: def.value,
    };
  });

const pinnedKeys = new Set((defaultFilters || []).map((f) => f.accessorKey));
const manualFilters = savedFilters
  .filter((f) => !pinnedKeys.has(f.accessorKey))
  .map((f) => ({ ...f, pinned: false }));
const initialFilters = [...buildPinnedFilters(), ...manualFilters];
// The pinned filters at their declared value: what a view leaves out of them.
const pinnedDefaultFilters: TableFilter[] = (defaultFilters || []).map(
  (filter) => ({
    accessorKey: filter.accessorKey,
    mode: filter.mode,
    value: filter.value,
    pinned: true,
    initialValue: filter.value,
  }),
);

const columnFilters = ref<TableFilter[]>(initialFilters);
const columnVisibility = ref<VisibilityState>(
  tablePreferences.get<VisibilityState>("columnVisibility", initialVisibility),
);
const columnSizing = ref<ColumnSizingState>({});
tablePreferences.restore("columnSizing", columnSizing);
const columnOrder = ref<string[]>([]);
tablePreferences.restore("columnOrder", columnOrder, Array.isArray);
const hasEmptyDefaultFilter = (defaultFilters || []).some(
  (f) => f.value === undefined || f.value === null || f.value === "",
);
const filtersRowOpen = ref<boolean>(hasEmptyDefaultFilter);
tablePreferences.restore("filtersOpen", filtersRowOpen);
const globalFilter = shallowRef<string>();
const globalFilterDebounced = refDebounced(
  globalFilter,
  GLOBAL_FILTER_DEBOUNCE_MS,
);
const showArchived = ref(false);

// The display the table counts as its default: the phone's `mobileDisplay`
// once applied (see `useMobileDisplay` below).
const displayDefault = ref(
  offeredDisplayIds.has(defaultDisplay) ? defaultDisplay : fallbackDisplayId,
);

// Views: named states of the whole table, the module's and the user's own.
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
    // Read when a view opens: a phone's `mobileDisplay` once applied.
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

// A phone opens on the table's `mobileDisplay` (cards rather than a grid cut
// after its first columns) unless a display was chosen: saved, fixed by the
// open view, or the only way in.
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

const { t, te, locale } = useI18n();

// A tab named by the URL wins over the one kept from the last visit.
const activeTabId = ref<string>(
  readTableUrlTab(route.query, urlScope) ??
    tablePreferences.get<string>("activeTab", ALL_TAB_ID),
);

interface ResolvedTab {
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

// A configured "all" tab stands in for the implicit one, at its own place.
const hasConfiguredAllTab = (tabs ?? []).some((tab) => tab.id === ALL_TAB_ID);

const resolvedTabs = computed<ResolvedTab[]>(() => {
  // Tabs are a transverse-but-table-shaped concept; displays that opt out of the
  // `tabs` capability (e.g. kanban) hide them and have their own grouping.
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
      // A link tab filters nothing: it opens another page.
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

// A link to this page while it is shown opens like a linked arrival: on the
// table's defaults plus what it names, leaving the kept state as it was.
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

const { $authFetch } = useAuthFetch();
// The controller's routes, or a `TableView.fromSource` table's route.
const tableRows = useTableRows<T>({
  api: $authFetch,
  location,
  source: props.source,
  columns: props.columns,
  route: () => ({
    routeParams: props.routeParams,
    routeQuery: route.query as Record<string, unknown>,
  }),
  // Groups keep their rows together: the grouped display pins nothing.
  pinnedRows: () => (isGroupedDisplay.value ? undefined : props.pinnedRows),
});
// Quick filters: dropdowns of the toolbar over a column's values (a select's
// items, a boolean, the rows a relation points to), writing that column's
// filter like the filters row does.
const { getDataType } = useDataTypes();
const relationQuickFilterValues = ref<Record<string, QuickFilterItem[]>>({});
// Relation values load after mount: until then their buttons hold their place.
const relationQuickFiltersLoaded = ref(false);
const quickFilterDefinitions = (props.quickFilters ?? []).map((filter) => {
  const column = allColumns.find(
    (candidate) => candidate.accessorKey === filter.field,
  );
  return {
    filter,
    column,
    mode: quickFilterMode(column, filter.mode),
    items: staticQuickFilterItems(column, processI18n),
    source: relationQuickFilterSource(column, getDataType),
  };
});

const RELATION_QUICK_FILTER_LIMIT = 200;

const loadRelationQuickFilters = async () => {
  await Promise.allSettled(
    quickFilterDefinitions
      .filter((definition) => !definition.items && definition.source)
      .map(async ({ filter, source }) => {
        try {
          const response = await $authFetch<
            TableViewListResponse<Record<string, unknown>>
          >(source!.searchUrl, {
            query: { limit: RELATION_QUICK_FILTER_LIMIT },
          });
          relationQuickFilterValues.value = {
            ...relationQuickFilterValues.value,
            [filter.field]: relationQuickFilterItems(response.results, source!),
          };
        } catch {
          // A picker the caller may not read just stays out of the toolbar.
        }
      }),
  );
  relationQuickFiltersLoaded.value = true;
};

// A quick filter with nothing to pick is left out of the toolbar; one whose
// relation values are still loading shows disabled, holding its place.
const resolvedQuickFilters = computed<ResolvedQuickFilter[]>(() =>
  quickFilterDefinitions
    .map(({ filter, column, mode, items, source }) => ({
      field: filter.field,
      label: processI18n(filter.label ?? column?.header ?? filter.field),
      icon: filter.icon ?? "i-ph-funnel",
      allLabel: filter.allLabel
        ? processI18n(filter.allLabel)
        : t("dms.table.quick_filter.all"),
      mode,
      items: items ?? relationQuickFilterValues.value[filter.field] ?? [],
      pending: !items && !!source && !relationQuickFiltersLoaded.value,
    }))
    .filter((filter) => filter.items.length > 0 || filter.pending),
);

const hiddenFilters = computed<TableFilter[]>(() => [
  ...queryParamHiddenFilters.value,
  ...routeParamHiddenFilters.value,
  ...activeTabFilters.value,
]);

const queryParamDefaults = computed<Record<string, unknown> | undefined>(() => {
  if (!queryParamFilters && !routeParamFilters) return undefined;

  const defaults: Record<string, unknown> = {};
  if (queryParamFilters) {
    for (const [param, config] of Object.entries(queryParamFilters)) {
      const value = route.query[param];
      if (value !== undefined) {
        defaults[config.field] = value;
      }
    }
  }
  if (routeParamFilters && routeParams) {
    for (const [param, config] of Object.entries(routeParamFilters)) {
      const value = routeParams[param];
      if (value !== undefined) {
        defaults[config.field] = value;
      }
    }
  }

  return Object.keys(defaults).length > 0 ? defaults : undefined;
});

// A display that hides a transverse control (capability off) must not silently
// keep applying that control's persisted state to the shared query.
const effectiveColumnFilters = computed<TableFilter[]>(() =>
  activeCapabilities.value.filters
    ? columnFilters.value
    : columnFilters.value.filter((f) => f.pinned),
);
const effectiveGlobalFilter = computed(() =>
  activeCapabilities.value.search ? globalFilterDebounced.value : undefined,
);
const isGroupedDisplay = computed(
  () => activeDisplayId.value === GROUPED_DISPLAY_ID && !!groupedOptions,
);
const sortingInput = computed<TableSortingInput>(() => ({
  reorderField: reorderConfig?.field,
  grouped: isGroupedDisplay.value ? activeGroupedOptions.value : undefined,
  canSort: activeCapabilities.value.sorting,
  sorting: sorting.value,
  defaultSorting: defaultSortState,
}));
// The order the rows are wanted in; the grouped display lists them on the
// grouped column and orders each group by it (`shownResults`).
const pickedSorting = computed(() => pickedTableSorting(sortingInput.value));
const effectiveSorting = computed<SortingState>(() => {
  const listed = listTableSorting(sortingInput.value);
  // The hand order is kept whole: its field need not be a sortable column.
  return reorderConfig && !sortingInput.value.grouped
    ? listed
    : sanitizeSorting(listed, sortableIds.value);
});

// A feed grows by pages (`loadMore`, `infinite`) rather than paging.
const paginationMode = props.pagination ?? "pages";
const { isAccumulating, requestedPagination, loadNextPage } =
  useAccumulatedPages({
    mode: paginationMode,
    pagination: paginationState,
    resetOn: [
      effectiveSorting,
      effectiveColumnFilters,
      hiddenFilters,
      effectiveGlobalFilter,
      showArchived,
    ],
  });

const queryRequest = computed(() =>
  buildTableQuery({
    pagination: requestedPagination.value,
    sorting: effectiveSorting.value,
    columnFilters: effectiveColumnFilters.value,
    hiddenFilters: hiddenFilters.value,
    globalFilter: effectiveGlobalFilter.value,
  }),
);
const archiveQuery = computed(() =>
  archiveMode ? { showArchived: showArchived.value } : {},
);

// The row a side panel has open, which the grid highlights.
const rowSidePanel = useRowSidePanelContent();
const rowSidePanelOwner = rowSidePanelOwnerKey(pageId!, componentId!);
const openRowId = computed(() =>
  rowSidePanel.value?.ownerKey === rowSidePanelOwner
    ? rowSidePanel.value.rowKey
    : undefined,
);

// The gate is set up with the other refresh triggers below; the hold only
// reads it once the table is on screen.
const NEW_ROWS_COUNT_ID = "liveHold:new";
const tableRoot = useTemplateRef<ComponentPublicInstance>("tableRoot");
const liveHold = useTableLiveHold({
  liveHold: props.liveHold,
  isSource: tableRows.isSource,
  gate: () => liveGate,
  signals: {
    isRowOpen: () => openRowId.value !== undefined,
    isSearching: () => !!effectiveGlobalFilter.value,
    isSorted: () => !isSameSorting(effectiveSorting.value, defaultSortState),
    tableElement: () => tableRoot.value?.$el ?? null,
  },
  // The pill counts the rows the table would list, on its own count route:
  // the rows its tab, search and filters match now, less those it holds.
  newRows: {
    heldList: () => data.value,
    countNow: async (signal) => {
      const counts = await tableRows.countBatch(
        [
          {
            id: NEW_ROWS_COUNT_ID,
            query: {
              ...buildTableQuery({
                pagination: { pageIndex: 0, pageSize: 0 },
                sorting: [],
                columnFilters: effectiveColumnFilters.value,
                hiddenFilters: hiddenFilters.value,
                globalFilter: effectiveGlobalFilter.value,
              }),
              ...archiveQuery.value,
            },
          },
        ],
        signal,
      );
      return counts[NEW_ROWS_COUNT_ID];
    },
  },
});

// The list, its counters and its footer figures load in parallel: a server
// render waits for each before rendering, whether or not the setup awaits it.
const { data, status, error, refresh } = useTableListData<T>({
  componentId,
  pageId,
  rows: tableRows,
  query: queryRequest,
  archiveQuery,
  isSelfManaged: isActiveDisplaySelfManaged,
  heldQuery: liveHold.heldQuery,
});

// The failure of the last answer. The async data keeps it while the next run
// is in flight; the table shows that run (its skeleton, or the rows it has)
// rather than the failure it may replace.
const settledError = computed(() =>
  status.value === "pending" ? null : error.value,
);

// Nothing listed yet (a client navigation paints before the first page
// arrives): the table draws its skeleton, never the empty state.
const isFirstPageLoading = computed(
  () => data.value === null && !settledError.value,
);
const isListLoading = computed(
  () => status.value === "pending" || isFirstPageLoading.value,
);

// A refused or failed list query must show as an error, never as an empty
// table: "no data" on a 403 would tell a blocked caller there is nothing
// to see.
// Always a key the panel can resolve. The backend body is a message key by
// contract, but not every one is translated (and a proxy error carries prose
// or HTML, which must never reach the screen); the HTTP status is the fallback
// that keeps a refusal distinguishable from a server failure.
const listLoadError = computed(() => {
  const failure = settledError.value;
  if (!failure) return undefined;
  const message = resolveApiErrorMessage(failure);
  if (te(`${message}.description`) || te(message)) return message;
  const status = (failure as { statusCode?: number }).statusCode;
  return status && te(`error.${status}.description`)
    ? `error.${status}`
    : "error.500";
});

// A list answering 404 names a resource that does not exist (the workspace
// its rows belong to was deleted): no retry fixes it, so the table gives way
// to the not-found state blocks show, with what the 404 said.
const listNotFound = computed(() => readFetchNotFound(settledError.value));

// useDmsAsyncData keeps the previous result when a refetch fails, so rows kept
// on screen would masquerade as the newly requested page/filter. Hide them
// while the latest query is in error; the error panel takes their place.
// Every consumer acting on visible rows (table, displays, selection
// shortcuts) must read the shown refs, never `data` directly.
const shownData = computed(() =>
  listLoadError.value ? undefined : data.value,
);
const shownResults = computed(() => {
  const results = shownData.value?.results;
  const grouped = activeGroupedOptions.value;
  return results && isGroupedDisplay.value && grouped
    ? orderGroupedRows(results, grouped, pickedSorting.value, locale.value)
    : results;
});

// Rows selected before the failure can no longer be seen or verified, yet the
// selection toolbar would keep offering delete/archive/export on them.
watch(listLoadError, (message) => {
  if (message) rowSelect.value = {};
});

// Whatever sets the sort (a header, the sort menu, a pasted table config), the
// route only ever receives a sort it accepts, and a cleared sort goes back to
// the default one rather than being remembered empty. A new order lists from page 1:
// the page reached in the previous order shows unrelated rows in the new one.
// Synchronous, so the list is queried once, with both changes.
watch(
  sorting,
  (next, previous) => {
    const sanitized = sortingOrDefault(
      next,
      sortableIds.value,
      defaultSortState,
    );
    if (!isSameSorting(sanitized, next)) {
      sorting.value = sanitized;
      return;
    }
    const before = sortingOrDefault(
      previous,
      sortableIds.value,
      defaultSortState,
    );
    if (
      !isSameSorting(sanitized, before) &&
      paginationState.value.pageIndex !== 0
    ) {
      paginationState.value = { ...paginationState.value, pageIndex: 0 };
    }
  },
  { deep: true, flush: "sync" },
);

const toast = useToast();

// The route refused the sort key anyway: a column whose `@Sortable()` was
// removed since the page loaded. Stop sorting on it (the next query drops it)
// and list again, with a warning, rather than leaving the table on its error
// panel.
watch(error, (failure) => {
  if (!failure || !isUnsortableFieldError(failure)) return;
  const refused = effectiveSorting.value[0]?.id;
  if (!refused) return;
  refusedSortIds.value = [...refusedSortIds.value, refused];
  sorting.value = sanitizeSorting(sorting.value, sortableIds.value);
  toast.add({
    title: t("dms.sort.reset_title"),
    description: t("dms.sort.reset_description", {
      column: columnLabel(refused),
    }),
    color: Color.warning,
    icon: "i-ph-warning",
  });
});

// A non-self-managed display consumes the shared query, and nothing
// guarantees it knows how to render a failure. While that query is in error,
// fall back to the table body so the error panel and its retry replace the
// display instead of letting it show blank content.
const activeDisplayBlockedByError = computed(
  () => !!listLoadError.value && !isActiveDisplaySelfManaged.value,
);

watch(
  [() => data.value?.total, () => paginationState.value.pageSize],
  ([total, pageSize]) => {
    if (total === undefined || total === null || pageSize <= 0) return;
    const maxPageIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (paginationState.value.pageIndex > maxPageIndex) {
      paginationState.value = {
        ...paginationState.value,
        pageIndex: maxPageIndex,
      };
    }
  },
);

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
const isCountStateNarrowed = computed(() => isCountNarrowed(countState.value));

// Each counter counts what a click on it would list, so the counters follow
// the filters, the search, the view and the tab: picks made in a row (quick
// filters toggled one after the other) are counted once, when they settle.
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

// No default: `null` until the counts arrive, so the tabs draw placeholders
// instead of a count of nothing.
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

interface ActiveDisplayExposed {
  refresh?: () => Promise<void> | void;
}

// Ref to the active display component (when one is rendered in #body); used to
// refresh self-managed displays on realtime updates and manual refresh.
const activeDisplayRef = ref<ActiveDisplayExposed | null>(null);

// Filters/search/sort query without paging — exposed generically on the context
// (context.query) for any self-managed display to fetch its own data.
const baseQuery = computed<Record<string, unknown>>(() => {
  const {
    limit: _limit,
    offset: _offset,
    ...query
  } = buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 0 },
    sorting: effectiveSorting.value,
    columnFilters: effectiveColumnFilters.value,
    hiddenFilters: hiddenFilters.value,
    globalFilter: effectiveGlobalFilter.value,
  });
  return { ...query, ...archiveQuery.value };
});

const { footer: resolvedFooter, refreshSummaries } = useTableFooter({
  footer: props.footer,
  columns: props.columns,
  location,
  query: baseQuery,
  dataKey: `table-view-${componentId}-${pageId}`,
});

const hasMoreRows = computed(
  () => (data.value?.total ?? 0) > (shownResults.value?.length ?? 0),
);
const loadMoreRows = () => {
  if (hasMoreRows.value && !isListLoading.value) loadNextPage();
};
// A row's drawer or side panel steps through every row the table lists: past
// the rows loaded, it turns the table's page (or grows its feed) and steps
// onto the rows that arrive. A display reading its own rows keeps to them.
const ADJACENT_ROWS_TIMEOUT_MS = 15_000;
const listsServerPages = computed(() => !isActiveDisplaySelfManaged.value);
// What a display reading its own rows shows (`setShownRows`), in its order:
// the rows its row's container steps through. Another display, another set.
const selfManagedRows = shallowRef<Data[]>([]);
const setSelfManagedRows = (rows: T[]) => {
  selfManagedRows.value = rows as Data[];
};
watch(activeDisplayId, () => {
  selfManagedRows.value = [];
});
const navigableRows = (): Data[] =>
  listsServerPages.value
    ? ((shownResults.value ?? []) as Data[])
    : selfManagedRows.value;
const loadedRowsOffset = () => {
  if (isAccumulating || !listsServerPages.value) return 0;
  const { pageIndex, pageSize } = paginationState.value;
  return pageSize > 0 ? pageIndex * pageSize : 0;
};
const turnPage = (step: RowStep): boolean => {
  if (isAccumulating) {
    if (step < 0 || !hasMoreRows.value) return false;
    loadNextPage();
    return true;
  }
  const { pageIndex, pageSize } = paginationState.value;
  const next = pageIndex + step;
  const total = data.value?.total ?? 0;
  if (pageSize <= 0 || next < 0 || next * pageSize >= total) return false;
  paginationState.value = { ...paginationState.value, pageIndex: next };
  return true;
};
let adjacentRowsLoad: Promise<boolean> | undefined;
const loadAdjacentRows = (step: RowStep): Promise<boolean> => {
  // A second J while the page loads waits for the same page.
  if (adjacentRowsLoad) return adjacentRowsLoad;
  if (!listsServerPages.value || isListLoading.value || !turnPage(step)) {
    return Promise.resolve(false);
  }
  const before = shownResults.value;
  adjacentRowsLoad = until(
    () => shownResults.value !== before && !isListLoading.value,
  )
    .toBe(true, { timeout: ADJACENT_ROWS_TIMEOUT_MS })
    .then(() => !listLoadError.value && shownResults.value !== before)
    .finally(() => {
      adjacentRowsLoad = undefined;
    });
  return adjacentRowsLoad;
};
// A row past the rows loaded (a deep link, a row live rows pushed out) is
// found in the table's whole result, under the query the list reads: its
// position, and its neighbours for the steps. Its rows read in the order
// the table shows them: pinned rows lead each page it reads, not the result.
const locateRow = rowLocator({
  list: async (offset, limit) => {
    if (!listsServerPages.value) return null;
    const page = await tableRows.listAsShown(
      {
        ...queryRequest.value,
        ...archiveQuery.value,
        ...liveHold.heldQuery(),
        offset,
        limit,
      },
      requestedPagination.value.pageSize,
    );
    return page && { results: page.results as Data[], total: page.total };
  },
  rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
  isWholeRead: () => !!props.source && !props.source.capabilities.paginate,
});

const accumulation = computed<TableAccumulation | undefined>(() =>
  isAccumulating
    ? {
        mode: paginationMode as TableAccumulation["mode"],
        shown: shownResults.value?.length ?? 0,
        hasMore: hasMoreRows.value,
        loading: isListLoading.value,
        load: loadMoreRows,
      }
    : undefined,
);

// Rows ordered by hand: moving is off while anything narrows the rows, and
// only the displays drawing the rows in their order move them.
const ORDERED_DISPLAY_IDS = new Set([TABLE_DISPLAY_ID, CARDS_DISPLAY_ID]);
const { reorderState } = useTableReorder<T>({
  reorder: reorderConfig,
  data,
  rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
  location,
  api: $authFetch,
  canEdit: computed(() => isActionEnabled(tableProps.value.rowActions?.edit)),
  isNarrowed: computed(
    () =>
      effectiveColumnFilters.value.some(isFilterEffective) ||
      !!effectiveGlobalFilter.value ||
      activeTabFilters.value.length > 0,
  ),
  isOrderedDisplay: computed(() =>
    ORDERED_DISPLAY_IDS.has(activeDisplayId.value),
  ),
  refresh: () => refresh(),
  onError: (failure) =>
    toast.add({
      title: t("dms.table.reorder.error"),
      description: describeTableWriteError(failure, t, allColumns, processI18n),
      color: Color.error,
      icon: "i-ph-warning-circle",
    }),
});

const { grouping, refreshCounts: refreshGroupCounts } = useGroupedRows({
  grouped: activeGroupedOptions,
  isActive: isGroupedDisplay,
  columns: props.columns,
  rows: shownResults,
  countQuery: (filter) => ({
    ...buildTableQuery({
      pagination: { pageIndex: 0, pageSize: 0 },
      sorting: [],
      columnFilters: [...effectiveColumnFilters.value, filter],
      hiddenFilters: hiddenFilters.value,
      globalFilter: effectiveGlobalFilter.value,
    }),
    ...archiveQuery.value,
  }),
  countBatch: tableRows.countBatch,
});

// Only what the (unchanged) KanbanBoard needs beyond the generic context: the
// two-way group-by ref and the raw action configs for per-row rule evaluation.
provide(KANBAN_DISPLAY_BRIDGE_KEY, {
  groupByField: kanbanGroupBy,
  editAction: tableProps.value.rowActions?.edit,
  deleteAction: tableProps.value.rowActions?.delete,
  onCardMoved: () => void refreshCounts(),
});

// A link tab counts the rows of the list it opens; a list the caller may not
// read shows no counter.
const linkTabCounts = ref<Record<string, number>>({});
// The link counters load after mount: until then their tabs hold a placeholder.
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

// Each re-read follows a change of the rows (a save, an action, a realtime
// event) or a refresh: what summarises them elsewhere (a navigation count)
// is told to read its figure again.
const { notifyTableDataChanged } = useTableDataChanges();
const refreshCounts = async () => {
  notifyTableDataChanged(location);
  await Promise.all([
    refreshTabCounts(),
    refreshLinkTabCounts(),
    refreshGroupCounts(),
    refreshSummaries(),
  ]);
};
const refreshAll = async () => {
  await Promise.all([
    refresh(),
    refreshCounts(),
    activeDisplayRef.value?.refresh?.(),
  ]);
};

// The rows can move without the table seeing it (a batch, a job, another
// block's action): a topic of the backend or a page refresh reads them again,
// keeping the current rows on screen until the answer lands. On a live page
// the row events below go through the same gate.
const liveGate = useRefreshTriggers(props.realtimeTopic, () => refreshAll());
// What the user asks for (a row action, the refresh button, ⌘R, a display's
// own action) reads at once, even while the live page is paused, and brings
// a held table up to date.
const refreshByUser = () => {
  liveGate.acknowledge();
  return refreshAll();
};
// A write of the user's (a row or bulk action, a form saved) can move what
// the rest of the page shows of the same records — a KPI, a tab's badge,
// another list: every block of the page reads its data again, this table
// among them, at once even on a paused live page.
const refreshAfterWrite = () => refreshPageBlocks();

// "Preview as role": a link tab to a page the previewed role could not open
// is drawn locked, one to a page it opens partially is drawn partially
// locked. Never outside a preview (`entryState` is null then).
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
  if (!tab.to) return tabCountsData.value == null;
  return !!tab.countFrom && !linkTabCountsLoaded.value;
};

const tabsWithCount = computed(() =>
  resolvedTabs.value.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: tab.to ? linkTabCounts.value[tab.id] : tabCountsData.value?.[tab.id],
    countPending: isTabCountPending(tab),
    icon: tab.icon,
    textColor: tab.textColor,
    iconColor: tab.iconColor,
    to: tab.to,
    previewLocked: linkTabPreviewState(tab) === "hidden",
    previewPartial: linkTabPreviewState(tab) === "partial",
  })),
);

// A tab declared with `navBadge` keeps the navigation badge the server
// counted for the page it stands for (the linked page, or this one) up to
// date: with the tab's own counter while nothing narrows it, else with a
// count of the tab alone, since the badge stands for the whole page. An
// empty badge stands for zero.
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
        typeof source.navBadge === "object" ? source.navBadge.tone : undefined;
      if (fullId) {
        setNavBadge(fullId, count > 0 ? String(count) : "", tone);
      }
    }
  },
  { immediate: true },
);

const { exportTable } = useTableViewExport({ componentId });
const {
  openRow,
  openRowById,
  editRow,
  newRow,
  duplicateRow,
  deleteRows: deleteRowsAction,
  archiveRows: archiveRowsAction,
  restoreRows: restoreRowsAction,
  handleCustomButton,
  handleCustomRowAction,
  handleBulkCustomAction,
  handleMissingRow,
  runConfirmedBuiltIn,
} = useTableRowActions<T>({
  api: $authFetch,
  location,
  columns: allColumns,
  caption,
  labelKey,
  rowIdKey: props.rowIdKey,
  refreshCallback: refreshAfterWrite,
  formComponents,
  formContainer,
  formPages,
  routeParams,
  componentId: componentId!,
  pageId: pageId!,
  queryParamFilters,
  rowNavigation: {
    rows: navigableRows,
    rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
    getRow: (id) => tableRows.getRow(id) as Promise<Data | undefined>,
    total: () =>
      listsServerPages.value
        ? (shownData.value?.total ?? undefined)
        : undefined,
    offset: loadedRowsOffset,
    loadAdjacent: loadAdjacentRows,
    locate: locateRow,
  },
  recordScope: urlScope,
  onRecordShown: (id) => recordLink?.shown(id),
});

// Custom actions offered on the selection bar. "Select all N matching"
// hands them the table's filters instead of ids; a new query lists other
// rows, so it ends with it.
const bulkCustomActions = computed(() =>
  (tableProps.value.rowActions?.custom ?? []).filter(isBulkAction),
);
const allMatching = ref(false);
const runBulkAction = (action: CustomRowAction) =>
  handleBulkCustomAction(
    action,
    allMatching.value
      ? { matching: baseQuery.value, count: data.value?.total ?? 0 }
      : { ids: selectedIds.value, count: selectedIds.value.length },
  );

// Archive mode: the toolbar carries an "Archived" toggle for callers allowed
// to see archived rows.
const canToggleArchived = computed(
  () => !!archiveMode && tableProps.value.rowActions?.showArchived === true,
);

// A selection made among the rows a filter, a search or a tab listed would
// let a bulk action reach rows no longer shown: it goes with them.
const selectionScope = computed(() =>
  selectionScopeKey({
    columnFilters: effectiveColumnFilters.value,
    hiddenFilters: hiddenFilters.value,
    globalFilter: effectiveGlobalFilter.value,
  }),
);
watch(selectionScope, () => {
  rowSelect.value = {};
});

// A selection made among active rows means nothing among archived ones, and
// the page reached in one list rarely exists in the other: start over.
watch(showArchived, () => {
  rowSelect.value = {};
  paginationState.value = { ...paginationState.value, pageIndex: 0 };
});

const customNavItems = computed(() => {
  const items = [];

  if (enableTableExport) {
    items.push({
      label: t("dms.button.export_data"),
      icon: "i-ph-export",
      onSelect: () => handleExportTable(),
    });
  }

  return items;
});

// Deleted, archived and restored rows leave the listed set: a selection kept
// on them would offer bulk actions on rows no longer shown. A cancelled
// confirmation (or a failed request) keeps the selection as it was.
const deselectRows = (ids: string[]) => {
  const removed = new Set(ids);
  rowSelect.value = Object.fromEntries(
    Object.entries(rowSelect.value).filter(([id]) => !removed.has(id)),
  );
};

// From the archive, a delete is a permanent one: its confirmation says so.
// A display holding the rows (a kanban card) hands them for its wording.
const deleteRows = async (ids: string[], rows?: T[]) => {
  const done = await deleteRowsAction(
    ids,
    tableProps.value.rowActions?.delete,
    {
      permanently: !!archiveMode && showArchived.value,
      rows,
    },
  );
  if (done) deselectRows(ids);
};

const archiveRows = async (ids: string[]) => {
  if (await archiveRowsAction(ids, tableProps.value.rowActions?.archive)) {
    deselectRows(ids);
  }
};

const restoreRows = async (ids: string[]) => {
  if (await restoreRowsAction(ids, tableProps.value.rowActions?.restore)) {
    deselectRows(ids);
  }
};

const handleExportTable = () =>
  exportTable(location, { ...queryRequest.value, ...archiveQuery.value });
const handleExportSelection = (ids: string[]) =>
  exportTable(location, queryRequest.value, ids);
// A built-in action declaring a `confirm` asks it first.
const rowActionConfig = (key: "details" | "duplicate" | "add" | "edit") =>
  tableProps.value.rowActions?.[key];
const handleRowClick = (item: T) =>
  runConfirmedBuiltIn(rowActionConfig("details"), item, () => openRow(item));
// Its dialog words the row shown (`{name}`), else only its id.
const handleRowDuplicate = (itemId: string) => {
  const idKey = props.rowIdKey ?? ROW_ID_DEFAULT_KEY;
  const shown = shownResults.value?.find(
    (row) => String(get(row, idKey)) === itemId,
  );
  return runConfirmedBuiltIn(
    rowActionConfig("duplicate"),
    shown ?? { [idKey]: itemId },
    () => duplicateRow(itemId),
  );
};
const handleRowAdd = () =>
  runConfirmedBuiltIn(rowActionConfig("add"), undefined, () =>
    newRow(queryParamDefaults.value),
  );

const rowIdKey = props.rowIdKey ?? ROW_ID_DEFAULT_KEY;
// A source table has no realtime: its route is no data controller's.
const realtimeLocation = tableRows.isSource ? undefined : location;
const realtimeRowTopic = computed(() =>
  realtimeLocation
    ? `${REALTIME_ROW_TOPIC_PREFIX}${realtimeLocation}`
    : undefined,
);
const realtimePresenceTopic = computed(() =>
  realtimeLocation
    ? `${REALTIME_PRESENCE_TOPIC_PREFIX}${realtimeLocation}`
    : undefined,
);

const presenceByRow = ref<RealtimePresenceMap>({});
const { user: realtimeUser } = useDmsUserSession();

const getRowId = (row: T): string | undefined => {
  const value = (row as Record<string, unknown>)[rowIdKey];
  if (value === undefined || value === null) return undefined;
  return String(value);
};

const removeRowsLocal = (ids: string[]) => {
  if (!data.value?.results) return;
  const idSet = new Set(ids);
  const next = data.value.results.filter((row) => {
    const id = getRowId(row);
    return !id || !idSet.has(id);
  });
  data.value = { ...data.value, results: next };
};

const patchRowLocal = async (id: string) => {
  if (!data.value?.results) return;
  const idx = data.value.results.findIndex((row) => getRowId(row) === id);
  if (idx === -1) return;
  try {
    const fresh = await tableRows.getRow(id);
    if (!fresh) return;
    const next = [...data.value.results];
    next[idx] = fresh as unknown as T;
    data.value = { ...data.value, results: next };
  } catch (error) {
    console.warn("[realtime] failed to refetch updated row", id, error);
  }
};

const realtimeEventHandlers: Record<
  string,
  (ids: string[]) => void | Promise<void>
> = {
  [REALTIME_EVENT_TYPE.DELETED]: (ids) => {
    removeRowsLocal(ids);
    // Rows gone elsewhere leave the selection too, or it would count them.
    deselectRows(ids);
    return refreshAll();
  },
  [REALTIME_EVENT_TYPE.CREATED]: () => refreshAll(),
  // An edited row can change tab, group or column: the counts are read again
  // with it.
  [REALTIME_EVENT_TYPE.UPDATED]: async (ids) => {
    if (isActiveDisplaySelfManaged.value) {
      await Promise.all([activeDisplayRef.value?.refresh?.(), refreshCounts()]);
      return;
    }
    await Promise.all([...ids.map((id) => patchRowLocal(id)), refreshCounts()]);
  },
};

// On a live page a row event is one more event behind the table: in Direct
// it reads the rows again (at most once per `maxRate`), paused it is counted
// and the rows stay as they are. Rows gone elsewhere still leave a selection
// the page shows moving.
const { isEnabled: isPageLive, isPaused: isPagePaused } = usePageLive();
const gateRowEvent = (type: string, ids: string[], event: object) => {
  if (type === REALTIME_EVENT_TYPE.DELETED && !isPagePaused.value) {
    deselectRows(ids);
  }
  liveGate.trigger(event);
};

useRealtimeTopic(realtimeRowTopic, (event) => {
  const payload = event as { type: string; payload?: { ids?: string[] } };
  const handler = realtimeEventHandlers[payload.type];
  if (!handler) return;
  const ids = payload.payload?.ids ?? [];
  if (ids.length === 0 && payload.type !== REALTIME_EVENT_TYPE.CREATED) return;
  if (isPageLive.value) {
    gateRowEvent(payload.type, ids, event);
    return;
  }
  void handler(ids);
});

const replacePresenceMap = (next: RealtimePresenceMap) => {
  presenceByRow.value = next;
};

const upsertPresence = (rowId: string, actor: RealtimePresenceActor) => {
  const current = presenceByRow.value[rowId] ?? [];
  if (current.some((entry) => entry.sessionId === actor.sessionId)) return;
  replacePresenceMap({
    ...presenceByRow.value,
    [rowId]: [...current, actor],
  });
};

const removePresence = (rowId: string, sessionId: string) => {
  const current = presenceByRow.value[rowId];
  if (!current) return;
  const next = current.filter((entry) => entry.sessionId !== sessionId);
  if (next.length === 0) {
    const { [rowId]: _removed, ...rest } = presenceByRow.value;
    replacePresenceMap(rest);
    return;
  }
  replacePresenceMap({ ...presenceByRow.value, [rowId]: next });
};

const applySnapshot = (
  entries: Array<{
    rowId: string;
    actor: { id: string; displayName?: string; avatarUrl?: string };
    sessionId: string;
    since?: number;
  }>,
) => {
  const next: RealtimePresenceMap = {};
  for (const entry of entries) {
    const list = next[entry.rowId] ?? [];
    list.push({
      ...entry.actor,
      sessionId: entry.sessionId,
      since: entry.since,
    });
    next[entry.rowId] = list;
  }
  replacePresenceMap(next);
};

useRealtimeTopic(realtimePresenceTopic, (event) => {
  const eventTyped = event as {
    type?: string;
    payload?: {
      rowId?: string;
      actor?: { id: string; displayName?: string; avatarUrl?: string };
      sessionId?: string;
      since?: number;
    };
    entries?: Array<{
      rowId: string;
      actor: { id: string; displayName?: string; avatarUrl?: string };
      sessionId: string;
      since?: number;
    }>;
  };
  if (Array.isArray(eventTyped.entries)) {
    applySnapshot(eventTyped.entries);
    return;
  }
  const { rowId, actor, sessionId, since } = eventTyped.payload ?? {};
  if (!rowId || !sessionId) return;
  if (eventTyped.type === REALTIME_EVENT_TYPE.ACQUIRED && actor) {
    upsertPresence(rowId, { ...actor, sessionId, since });
    return;
  }
  if (eventTyped.type === REALTIME_EVENT_TYPE.RELEASED) {
    removePresence(rowId, sessionId);
  }
});

const filterSelf = (
  entries: RealtimePresenceActor[],
): RealtimePresenceActor[] => {
  const myId = realtimeUser.value?._id;
  return myId ? entries.filter((entry) => entry.id !== myId) : entries;
};

const otherEditorsForRow = (rowId: string): RealtimePresenceActor[] => {
  return filterSelf(presenceByRow.value[rowId] ?? []);
};

const presenceByRowFiltered = computed<RealtimePresenceMap>(() => {
  const result: RealtimePresenceMap = {};
  for (const [rowId, entries] of Object.entries(presenceByRow.value)) {
    const others = filterSelf(entries);
    if (others.length > 0) result[rowId] = others;
  }
  return result;
});

// Expandable rows: which rows are open. A newly listed set (page, filter,
// search, sort, tab, archive view) starts from `defaultExpanded`; a refresh of
// the same set keeps what the user opened, minus rows no longer listed.
const expandableConfig = props.expandable;
const expanded = ref<ExpandedRowMap>({});

const rowIdsOf = (rows: T[] | undefined): string[] =>
  (rows ?? []).map((row) => getRowId(row)).filter((id): id is string => !!id);

const expandedModel = computed<ExpandedState>({
  get: () => expanded.value,
  set: (next) => {
    expanded.value = nextExpandedRows(
      expanded.value,
      next,
      rowIdsOf(shownResults.value),
      expandableConfig?.single,
    );
  },
});

let expandedListedKey: string | undefined;
if (expandableConfig) {
  watch(
    shownResults,
    (rows) => {
      const next = expandedRowsOnListing(
        { expanded: expanded.value, listedKey: expandedListedKey },
        rows ? rowIdsOf(rows) : undefined,
        JSON.stringify([queryRequest.value, archiveQuery.value]),
        expandableConfig.defaultExpanded,
        expandableConfig.single,
      );
      expandedListedKey = next.listedKey;
      expanded.value = next.expanded;
    },
    { immediate: true },
  );
}

// `lazyLoad` bands read their row when it opens; any reload of the listed
// rows drops what they read, and the open ones read it again.
const expandedDetails = useExpandedRowDetails<T>((id) => tableRows.getRow(id));
if (expandableConfig?.lazyLoad) {
  watch(shownResults, () => expandedDetails.reset());
  watch(
    [expanded, shownResults],
    () =>
      expandedDetails.ensure(
        Object.keys(expanded.value).filter((id) => expanded.value[id]),
      ),
    { immediate: true },
  );
}

const expandedRowLoadState = (id: string): ExpandedRowLoadState =>
  expandableConfig?.lazyLoad
    ? (expandedDetails.entryOf(id)?.state ?? "loading")
    : "ready";

// The band takes any row: its props are the table's, for the row type it lists.
const expandedRowProps = (listed: T): TableViewExpandedRowProps => {
  const id = getRowId(listed);
  const read = id ? expandedDetails.entryOf(id)?.row : undefined;
  return buildExpandedRowProps<T>(
    read ? { ...listed, ...read } : listed,
    displayContext.value,
  ) as unknown as TableViewExpandedRowProps;
};

const { warnBeforeEdit } = usePresenceEditWarning();

const handleRowEdit = async (item: T) => {
  const itemId = getRowId(item);
  if (itemId) {
    const others = otherEditorsForRow(itemId);
    if (others.length > 0 && !(await warnBeforeEdit(others))) return;
  }
  return runConfirmedBuiltIn(rowActionConfig("edit"), item, () =>
    editRow(item, queryParamDefaults.value),
  );
};

const EMPTY_ITEMS: T[] = [];

watch(
  baseQuery,
  () => {
    allMatching.value = false;
  },
  { deep: true },
);
watch(rowSelect, (selection) => {
  if (Object.keys(selection).length === 0) allMatching.value = false;
});

// A deep-linked action reopens on the row the URL names, listed or not. A
// list still loading is waited for first: a row it lists keeps its position
// among the rows shown, and a source table without `fetchRowUrl` has no
// route to read one row from.
const deepLinkAction = (tableProps.value.rowActions?.custom ?? []).find(
  isDeepLinkAction,
);
const recordLink = deepLinkAction
  ? useTableRecordLink<T>({
      route,
      urlScope,
      action: deepLinkAction,
      resolve: async (id) => {
        await until(isListLoading).toBe(false);
        return resolveDeepLinkedRow(id, {
          listed: shownResults.value ?? undefined,
          idOf: getRowId,
          getRow: tableRows.getRow,
        });
      },
      open: (row) => handleCustomRowAction(deepLinkAction, row as Data),
      showMissing: (id) => handleMissingRow(deepLinkAction, id),
      notify: (outcome) => toast.add(recordLinkToasts[outcome]()),
    })
  : undefined;

const recordLinkToasts = {
  notify: () => ({
    title: t("dms.record_link.not_found_title"),
    description: t("dms.record_link.not_found_description"),
    color: Color.warning,
    icon: "i-ph-link-break",
  }),
  notifyFailed: () => ({
    title: t("dms.record_link.failed_title"),
    description: t("dms.record_link.failed_description"),
    color: Color.error,
    icon: "i-ph-warning-circle",
  }),
};

const selectedIds = computed(() => selectedRowIds(rowSelect.value));

const isRowActionEnabled = (
  config: boolean | RowActionConfig | undefined,
  item: T,
): boolean => {
  const normalized = normalizeActionConfig(config);
  if (!normalized.isEnabled) return false;
  if (!normalized.rule) return true;
  return evaluateRowActionRule(
    normalized.rule,
    item as Record<string, unknown>,
  );
};

// Stable API objects (defined once): they only capture stable refs, so the
// display context keeps a stable identity across renders.
const displaySelection = {
  isSelected: (id: string) => !!rowSelect.value[id],
  toggle: (id: string, value?: boolean) => {
    if (value ?? !rowSelect.value[id]) {
      rowSelect.value = { ...rowSelect.value, [id]: true };
      return;
    }
    const { [id]: _removed, ...rest } = rowSelect.value;
    rowSelect.value = rest;
  },
  // Decide from the visible page and merge, so selections on other server-paged
  // pages are preserved rather than cleared.
  toggleAll: (value?: boolean) => {
    const ids = (shownResults.value ?? [])
      .map((row) => getRowId(row))
      .filter((id): id is string => !!id);
    const allVisibleSelected =
      ids.length > 0 && ids.every((id) => rowSelect.value[id]);
    if (value ?? !allVisibleSelected) {
      rowSelect.value = {
        ...rowSelect.value,
        ...Object.fromEntries(ids.map((id) => [id, true])),
      };
      return;
    }
    const removed = new Set(ids);
    rowSelect.value = Object.fromEntries(
      Object.entries(rowSelect.value).filter(([id]) => !removed.has(id)),
    );
  },
  clear: () => {
    rowSelect.value = {};
  },
};

const displayPagination = {
  setPage: (index: number) => {
    paginationState.value = { ...paginationState.value, pageIndex: index };
  },
  setPageSize: (size: number) => {
    paginationState.value = {
      ...paginationState.value,
      pageSize: size,
      pageIndex: 0,
    };
  },
};

// A display opens an item the way a click opens a row of the grid: its
// default custom action, else edit, else details.
const builtInRowClicks: Record<"edit" | "details", (item: T) => unknown> = {
  edit: handleRowEdit,
  details: handleRowClick,
};
const openDisplayItem = (item: T) => {
  const action = resolveRowClickAction(
    tableProps.value.rowActions,
    item as Record<string, unknown>,
  );
  if (!action) return;
  if (typeof action === "string") {
    void builtInRowClicks[action](item);
    return;
  }
  handleCustomRowAction(action, item);
};

const displayRowActions = {
  add: handleRowAdd,
  edit: handleRowEdit,
  delete: deleteRows,
  duplicate: handleRowDuplicate,
  details: handleRowClick,
  open: openDisplayItem,
  custom: handleCustomRowAction,
  canEditRow: (item: T) =>
    isRowActionEnabled(tableProps.value.rowActions?.edit, item),
  canDeleteRow: (item: T) =>
    isRowActionEnabled(tableProps.value.rowActions?.delete, item),
  customFor: (item: T) =>
    rowCustomActions(
      tableProps.value.rowActions?.custom,
      item as Record<string, unknown>,
    ),
};

// The TanStack instance is only available as a #body slot prop; captured here so
// the context can stay a memoized computed (stable identity unless its deps change).
const displayTable = shallowRef<Table<T>>();
const captureDisplayTable = (table: Table<T>) => {
  if (displayTable.value !== table) displayTable.value = table;
};

const displayContext = computed(
  (): TableViewDisplayContext<T> => ({
    items: shownResults.value ?? EMPTY_ITEMS,
    columns: props.columns,
    loading: isListLoading.value,
    firstPageLoading: isFirstPageLoading.value,
    selection: { ids: selectedIds.value, ...displaySelection },
    pagination: {
      pageIndex: paginationState.value.pageIndex,
      pageSize: paginationState.value.pageSize,
      total: data.value?.total ?? 0,
      ...displayPagination,
      mode: paginationMode,
      hasMore: hasMoreRows.value,
      loadMore: loadMoreRows,
    },
    actions: {
      canAdd: isActionEnabled(tableProps.value.rowActions?.add),
      canEdit: isActionEnabled(tableProps.value.rowActions?.edit),
      canDelete: isActionEnabled(tableProps.value.rowActions?.delete),
      canDetails: isActionEnabled(tableProps.value.rowActions?.details),
      ...displayRowActions,
    },
    presenceByRow: presenceByRowFiltered.value,
    rowIdKey,
    labelKey,
    location,
    query: baseQuery.value,
    componentId,
    pageId,
    options: optionsForDisplay(activeDisplayId.value),
    refresh: refreshByUser,
    setShownRows: setSelfManagedRows,
    reorder: reorderState.value,
    table: displayTable.value,
  }),
);

const contextForSlot = (table: Table<T>): TableViewDisplayContext<T> => {
  captureDisplayTable(table);
  return displayContext.value;
};

const router = useDmsRouter();

async function clearQuickActionQuery() {
  const {
    [QUICK_ACTION_QUERY_KEY]: _discarded,
    [QUICK_ACTION_COMPONENT_KEY]: _discardedComponent,
    [QUICK_ACTION_BUTTON_KEY]: _discardedButton,
    ...rest
  } = route.query;
  await router.replace({ query: rest });
}

// The button is looked up among the ones the server kept for this caller: a
// button it stripped cannot be pressed through the URL either.
function pressCustomButton(id: string) {
  const button = customButtons?.find((candidate) => candidate.id === id);
  if (button) handleCustomButton(button);
}

const quickActionHandlers: {
  [K in QuickActionIntent["kind"]]: (
    intent: Extract<QuickActionIntent, { kind: K }>,
  ) => void;
} = {
  add: () => handleRowAdd(),
  button: (intent) => pressCustomButton(intent.button),
};

function runQuickActionIntent(intent: QuickActionIntent) {
  // Keyed by the intent's own discriminant, so the handler always matches.
  const handler = quickActionHandlers[intent.kind] as (
    value: QuickActionIntent,
  ) => void;
  handler(intent);
}

// Watched key by key rather than through the parsed intent: a fresh intent
// object on every unrelated query change would press the button twice.
watch(
  [
    QUICK_ACTION_QUERY_KEY,
    QUICK_ACTION_COMPONENT_KEY,
    QUICK_ACTION_BUTTON_KEY,
  ].map((key) => () => route.query[key]),
  () => {
    const intent = readQuickActionIntent(route.query, componentId);
    if (!intent) return;
    // A server render only drops the query (a redirect): it opens nothing.
    if (import.meta.env.SSR) {
      void clearQuickActionQuery();
      return;
    }
    // Run first, then drop the query: dropping it is a server visit, and a
    // visit cut short by a navigation still settles, so awaiting it first
    // opened the form over the page navigated to.
    runQuickActionIntent(intent);
    void clearQuickActionQuery();
  },
  { immediate: true },
);

// A header button of this page presses this table view's buttons in place
// (see `runMountedQuickAction`): the modal opens on the click.
let unregisterQuickActionTarget: (() => void) | undefined;
onMounted(() => {
  if (!componentId) return;
  unregisterQuickActionTarget = registerQuickActionTarget({
    path: route.path,
    componentId,
    run: runQuickActionIntent,
  });
});
onBeforeUnmount(() => unregisterQuickActionTarget?.());

defineShortcuts(
  buildTableViewShortcuts({
    refresh: refreshByUser,
    tableProps,
    newRow: () => newRow(queryParamDefaults.value),
    globalFilter,
    rowSelect,
    data: shownData,
    activeElement: useActiveElement(),
  }),
);

// Each kept field with its default: a value back to it is forgotten.
// A hand-ordered table keeps no sort.
const tableStatePreferences: TableStatePreference[] = [
  ...(reorderConfig
    ? []
    : [["sorting", sorting, defaultSortState] as TableStatePreference]),
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

// Resizing fires on every mousemove (columnResizeMode "onChange"); debounce so
// the preference cookie is only written once the drag settles.
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

// Flush a pending resize if the user navigates away (SPA route change, unmount)
// within the debounce window — otherwise the debounced write is cancelled on
// teardown and the last width is silently dropped.
onBeforeUnmount(() => {
  if (pendingColumnSizingWrite) persistColumnSizing();
});

function watchAndEmit<T>(
  source: WatchSource<T>,
  event: string,
  componentId: string,
  mapper: (val: T) => Record<string, unknown> = (v) =>
    v as Record<string, unknown>,
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
  // The registry is client-only; once hydrated, degrade to the fallback display
  // if the active id is no longer available (e.g. kanban with no eligible column).
  if (
    activeDisplayId.value !== fallbackDisplayId &&
    !isConfigRenderedDisplay(activeDisplayId.value) &&
    !availableDisplays.value.some((d) => d.id === activeDisplayId.value)
  ) {
    activeDisplayId.value = fallbackDisplayId;
  }
});
</script>

<template>
  <DmsBlockStatus
    v-if="listNotFound"
    state="not-found"
    :not-found="listNotFound"
  />
  <UTable
    v-else
    ref="tableRoot"
    v-bind="tableProps"
    v-model:pagination="paginationState"
    v-model:global-filter="globalFilter"
    v-model:sorting="sorting"
    v-model:row-selection="rowSelect"
    v-model:column-filters="columnFilters"
    v-model:column-visibility="columnVisibility"
    v-model:column-sizing="columnSizing"
    v-model:column-order-state="columnOrder"
    v-model:filters-row-open="filtersRowOpen"
    v-model:active-tab="activeTabId"
    v-model:active-display="activeDisplayId"
    v-model:kanban-group-by="kanbanGroupBy"
    v-model:grouped-group-by="groupedGroupBy"
    v-model:show-archived="showArchived"
    v-model:expanded="expandedModel"
    v-model:density="density"
    :chrome="resolvedChrome"
    :grouping="grouping"
    :accumulation="accumulation"
    :reorder="reorderState"
    :views-placement="viewsLayout === 'menu' ? 'header' : 'band'"
    :search-placeholder="props.searchPlaceholder"
    :search-shortcut="props.searchShortcut"
    :quick-filters="resolvedQuickFilters"
    :footer="resolvedFooter"
    :empty-states="props.emptyStates"
    :hidden-filters-apply="queryParamHiddenFilters.length > 0"
    :url-filters="shownUrlFilters"
    :default-page-size="props.pageSize"
    :archive-toggle="canToggleArchived"
    :archived-count-label="props.archivedCountLabel"
    :displays="availableDisplays"
    :active-capabilities="activeCapabilities"
    :kanban-group-by-options="kanbanGroupByOptions"
    :grouped-group-by-options="groupedGroupByOptions"
    :tabs="tabsWithCount"
    :initial-column-visibility="initialVisibility"
    :loading="isListLoading"
    :first-page-loading="isFirstPageLoading"
    :load-error="listLoadError"
    :data="shownResults || []"
    :pagination-options="{ manualPagination: true, rowCount: data?.total }"
    :sorting-options="{
      manualSorting: true,
      enableSorting: activeCapabilities.sorting,
    }"
    :default-sort="tableDefaultSort"
    :default-sort-label="defaultSortLabel"
    :default-sort-kind="defaultSortKind"
    :global-filter-options="{ enableGlobalFilter: false }"
    :columns="listableColumns"
    :custom-nav-items="customNavItems"
    :custom-buttons="customButtons"
    :can-export="enableTableExport"
    :on-custom-button="handleCustomButton"
    :on-custom-row-action="handleCustomRowAction"
    :bulk-actions="bulkCustomActions"
    v-model:all-matching="allMatching"
    :presence-by-row="presenceByRowFiltered"
    :open-row-id="openRowId"
    @add="handleRowAdd"
    @refresh="refreshByUser"
    @details="handleRowClick"
    @delete="(e) => deleteRows(e)"
    @archive="(e) => archiveRows(e)"
    @restore="(e) => restoreRows(e)"
    @export="handleExportSelection"
    @export-all="handleExportTable"
    @bulk-action="runBulkAction"
    @duplicate="handleRowDuplicate"
    @remove-url-filter="removeUrlFilter"
    @edit="handleRowEdit"
  >
    <template v-if="liveHold.reason.value" #notice>
      <LiveHoldBanner
        :count="liveHold.newCount.value"
        :reason="liveHold.reason.value"
        :missed-label="liveHold.missedLabel"
        :detail="liveHold.missedDetail.value"
        @show="liveHold.showNew"
      />
    </template>
    <!-- What came in while the rows were read or the page paused: a pill
         over the first rows, under the column header band (the table sets
         its height; a sticky one stays put above a scrolled area, so the pill
         stays under it), taking no room, so the rows stay where they are.
         Above the pinned columns and the presence rail it overlaps. -->
    <template v-else-if="liveHold.newCount.value > 0" #notice>
      <div class="relative z-30 h-0">
        <div
          class="pointer-events-none absolute inset-x-0 top-[calc(var(--dms-table-head-height,0px)+0.5rem)] flex justify-center px-4"
        >
          <LiveHoldBanner
            floating
            class="pointer-events-auto"
            :count="liveHold.newCount.value"
            :missed-label="liveHold.missedLabel"
            :detail="liveHold.missedDetail.value"
            @show="liveHold.showNew"
          />
        </div>
      </div>
    </template>
    <template v-if="hasViews" #views>
      <TableViews
        :items="viewItems"
        :active-id="activeViewId"
        :layout="viewsLayout"
        :modified="isViewModified"
        :can-save-as="canSaveViews"
        :divided="tabsWithCount.length === 0"
        @open="selectView"
        @reset="resetView"
        @save="saveView"
        @save-as="saveAsNewView"
        @delete="deleteView"
      />
    </template>
    <template v-if="expandableConfig" #expanded="{ row }">
      <ExpandedRowDetail
        :row-props="expandedRowProps(row.original)"
        :config="expandableConfig"
        :load-state="expandedRowLoadState(row.id)"
        @retry="expandedDetails.load(row.id)"
      />
    </template>
    <template
      v-if="activeDisplayComponent && !activeDisplayBlockedByError"
      #body="{ table }"
    >
      <component
        :is="activeDisplayComponent"
        ref="activeDisplayRef"
        :context="contextForSlot(table)"
      />
    </template>
  </UTable>
</template>
