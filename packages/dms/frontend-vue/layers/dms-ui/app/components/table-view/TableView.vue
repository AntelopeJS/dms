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

type TableStatePreference = [TableField, Ref<unknown>, unknown];

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

const persistedDisplay = tablePreferences.get<string>(
  "viewMode",
  defaultDisplay,
);

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

  const fromConfig = resolvedDisplay(id)?.component;
  if (fromConfig) return resolveDisplayComponentRef(fromConfig);
  const registered = getById(id)?.component;
  if (registered) return resolveDisplayComponentRef(registered);
  return STATIC_DISPLAY_COMPONENTS[id];
});

const defaultKanbanGroupBy = kanbanOptions?.groupByField ?? "";
const kanbanGroupBy = ref<string>(defaultKanbanGroupBy);

tablePreferences.restore(
  "kanbanGroupBy",
  kanbanGroupBy,
  (field) =>
    !kanbanOptions ||
    kanbanEligibleColumns.some((c) => c.accessorKey === field),
);

const DEFAULT_DENSITY = "default";

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

const paginationState = usePersistedPagination({
  preferences: tablePreferences,
  defaults: DEFAULT_PAGINATION,
  scope: () => [queryParamHiddenFilters.value, routeParamHiddenFilters.value],
});
const rowSelect = ref<RowSelectionState>({});

const columnLabel = (id: string): string => {
  const column = allColumns.find((c) => (c.id ?? c.accessorKey) === id);
  return column ? processI18n(column.header) : id;
};

const declaredSortableIds = sortableColumnIds(allColumns);

const refusedSortIds = ref<string[]>([]);
const sortableIds = computed(
  () =>
    new Set(
      [...declaredSortableIds].filter(
        (id) => !refusedSortIds.value.includes(id),
      ),
    ),
);

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

const tableDefaultSort = resolveDefaultSortConfig(
  defaultSort,
  declaredSortableIds,
  import.meta.env.DEV ? (message) => console.warn(message) : undefined,
);
const defaultSortState: SortingState = defaultSortingState(tableDefaultSort);

const defaultSortLabel = tableDefaultSort
  ? columnLabel(tableDefaultSort.field)
  : undefined;
const defaultSortKind = tableDefaultSort
  ? sortValueKind(
      allColumns.find((c) => (c.id ?? c.accessorKey) === tableDefaultSort.field)
        ?.type?.id,
    )
  : undefined;

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

const displayDefault = ref(
  offeredDisplayIds.has(defaultDisplay) ? defaultDisplay : fallbackDisplayId,
);

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

const tableRows = useTableRows<T>({
  api: $authFetch,
  location,
  source: props.source,
  columns: props.columns,
  route: () => ({
    routeParams: props.routeParams,
    routeQuery: route.query as Record<string, unknown>,
  }),

  pinnedRows: () => (isGroupedDisplay.value ? undefined : props.pinnedRows),
});

const { getDataType } = useDataTypes();
const relationQuickFilterValues = ref<Record<string, QuickFilterItem[]>>({});

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
        // prettier-ignore
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
          // eslint-disable-line no-empty -- Failed loads retain prior choices.
        }
      }),
  );
  relationQuickFiltersLoaded.value = true;
};

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

const pickedSorting = computed(() => pickedTableSorting(sortingInput.value));
const effectiveSorting = computed<SortingState>(() => {
  const listed = listTableSorting(sortingInput.value);

  return reorderConfig && !sortingInput.value.grouped
    ? listed
    : sanitizeSorting(listed, sortableIds.value);
});

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

const rowSidePanel = useRowSidePanelContent();
const rowSidePanelOwner = rowSidePanelOwnerKey(pageId!, componentId!);
const openRowId = computed(() =>
  rowSidePanel.value?.ownerKey === rowSidePanelOwner
    ? rowSidePanel.value.rowKey
    : undefined,
);

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

const { data, status, error, refresh } = useTableListData<T>({
  componentId,
  pageId,
  rows: tableRows,
  query: queryRequest,
  archiveQuery,
  isSelfManaged: isActiveDisplaySelfManaged,
  heldQuery: liveHold.heldQuery,
});

const settledError = computed(() =>
  status.value === "pending" ? null : error.value,
);

const isFirstPageLoading = computed(
  () => data.value === null && !settledError.value,
);
const isListLoading = computed(
  () => status.value === "pending" || isFirstPageLoading.value,
);

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

const listNotFound = computed(() => readFetchNotFound(settledError.value));

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

watch(listLoadError, (message) => {
  if (message) rowSelect.value = {};
});

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

const activeDisplayRef = ref<ActiveDisplayExposed | null>(null);

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

const ADJACENT_ROWS_TIMEOUT_MS = 15_000;
const listsServerPages = computed(() => !isActiveDisplaySelfManaged.value);

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

provide(KANBAN_DISPLAY_BRIDGE_KEY, {
  groupByField: kanbanGroupBy,
  editAction: tableProps.value.rowActions?.edit,
  deleteAction: tableProps.value.rowActions?.delete,
  onCardMoved: () => void refreshCounts(),
});

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

const liveGate = useRefreshTriggers(props.realtimeTopic, () => refreshAll());

const refreshByUser = () => {
  liveGate.acknowledge();
  return refreshAll();
};

const refreshAfterWrite = () => refreshPageBlocks();

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

const canToggleArchived = computed(
  () => !!archiveMode && tableProps.value.rowActions?.showArchived === true,
);

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

const deselectRows = (ids: string[]) => {
  const removed = new Set(ids);
  rowSelect.value = Object.fromEntries(
    Object.entries(rowSelect.value).filter(([id]) => !removed.has(id)),
  );
};

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

const rowActionConfig = (key: "details" | "duplicate" | "add" | "edit") =>
  tableProps.value.rowActions?.[key];
const handleRowClick = (item: T) =>
  runConfirmedBuiltIn(rowActionConfig("details"), item, () => openRow(item));

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

    deselectRows(ids);
    return refreshAll();
  },
  [REALTIME_EVENT_TYPE.CREATED]: () => refreshAll(),

  [REALTIME_EVENT_TYPE.UPDATED]: async (ids) => {
    if (isActiveDisplaySelfManaged.value) {
      await Promise.all([activeDisplayRef.value?.refresh?.(), refreshCounts()]);
      return;
    }
    await Promise.all([...ids.map((id) => patchRowLocal(id)), refreshCounts()]);
  },
};

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
  const handler = quickActionHandlers[intent.kind] as (
    value: QuickActionIntent,
  ) => void;
  handler(intent);
}

watch(
  [
    QUICK_ACTION_QUERY_KEY,
    QUICK_ACTION_COMPONENT_KEY,
    QUICK_ACTION_BUTTON_KEY,
  ].map((key) => () => route.query[key]),
  () => {
    const intent = readQuickActionIntent(route.query, componentId);
    if (!intent) return;

    if (import.meta.env.SSR) {
      void clearQuickActionQuery();
      return;
    }

    runQuickActionIntent(intent);
    void clearQuickActionQuery();
  },
  { immediate: true },
);

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
