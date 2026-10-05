<script setup lang="ts" generic="T extends Data">
import type {
  ColumnSizingState,
  ExpandedState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/vue-table";
import { refDebounced, useActiveElement, watchDebounced } from "@vueuse/core";
import {
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
  type QuickActionIntent,
  readQuickActionIntent,
} from "../../types/quick-actions";
import { registerQuickActionTarget } from "../../utils/quickActionTargets";
import type {
  KanbanConfig,
  TableViewConfig,
  TableViewExpandableConfig,
  TableViewFooter,
  TableViewQuickFilter,
  TableViewListResponse,
  TableViewDisplayContext,
  TableViewDisplayConfig,
  TableViewViewsConfig,
  TableViewGroupedConfig,
  TableViewEmptyStatesConfig,
  TableViewPaginationMode,
} from "../../composables/table-view/types";
import {
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
  TableViewEvents,
} from "../../composables/table-view/types";
import {
  isEligibleKanbanColumn,
  KANBAN_DISPLAY_BRIDGE_KEY,
} from "../../composables/table-view/kanban";
import { useTableRowActions } from "../../build/composables/table-view/useTableViewRowActions";
import {
  buildTableDataKey,
  buildTableQuery,
} from "../../build/composables/table-view/utils/tableQuery";
import { buildTableViewShortcuts } from "../../composables/table-view/shortcuts";
import {
  defaultExpandedRows,
  type ExpandedRowMap,
  keepListedRows,
  nextExpandedRows,
} from "../../build/composables/table-view/utils/expandedRows";
import { resolveTableChrome } from "../../build/composables/table-view/utils/chrome";
import {
  isSameSorting,
  isUnsortableFieldError,
  defaultSortingState,
  resolveDefaultSortConfig,
  sanitizeSorting,
  sortableColumnIds,
  sortValueKind,
} from "../../build/composables/table-view/utils/sortableColumns";
import { selectedRowIds } from "../../build/composables/table-view/utils/bulkActions";
import { isBulkAction } from "../../build/composables/actions/bulkSelection";
import { readRecordId } from "../../build/composables/table-view/utils/recordLink";
import type { CustomRowAction } from "../../types/row-action";
import {
  type QuickFilterItem,
  quickFilterMode,
  relationQuickFilterItems,
  relationQuickFilterSource,
  type ResolvedQuickFilter,
  staticQuickFilterItems,
} from "../../build/composables/table-view/utils/quickFilters";
import { useNavBadges } from "../../composables/navigation/useNavBadges";
import { resolveRowClickAction } from "../../utils/rowClickAction";
import { usePermissionPreview } from "#dms-core/app/composables/auth/usePermissionPreview";

import UTable from "../../build/components/table/Table.vue";
import ExpandedRowDetail from "./ExpandedRowDetail.vue";
import type {
  TableAccumulation,
  TableViewSwitcherItem,
} from "../../build/components/table/Table.vue";
import {
  defineAsyncComponent,
  type Component,
  type WatchOptions,
  type WatchSource,
} from "vue";
import { useTableViewConfig } from "../../build/composables/table-view/useTableViewConfig";
import { useTableViews } from "../../build/composables/table-view/useTableViews";
import { useGroupedRows } from "../../build/composables/table-view/useGroupedRows";
import { useTableFooter } from "../../build/composables/table-view/useTableFooter";
import { useAccumulatedPages } from "../../build/composables/table-view/useAccumulatedPages";
import { groupedSorting } from "../../build/composables/table-view/utils/groupedRows";
import { readTableUrlKey } from "../../build/composables/table-view/utils/views";
import TableViews, {
  type TableViewItem,
} from "../../build/components/table/Views.vue";
import { useServerRenderedAsyncData } from "../../composables/table-view/useServerRenderedAsyncData";
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

// The backend options of a table view, declared here as well so the
// component's runtime props never depend on resolving the imported config.
interface TableViewProps<T extends Data> extends TableViewConfig<T> {
  /** Expandable rows: caret column + detail band (backend `expandable`). */
  expandable?: TableViewExpandableConfig;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /** One-click dropdown filters of the toolbar. */
  quickFilters?: TableViewQuickFilter[];
  /** Rows per page while the user picked none. */
  pageSize?: number;
  /** How the rows beyond the first page are reached. */
  pagination?: TableViewPaginationMode;
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

const { getPreference, setPreference } = usePreferences();
const { sendComponentEvent } = useComponentEvent(componentId);
const { processI18n } = useTranslation();

const getTablePreferenceKey = (suffix: string) => {
  return `tables.${componentId}.${pageId}.${suffix}`;
};

const kanbanEligibleColumns = allColumns.filter(isEligibleKanbanColumn);
const kanbanGroupByOptions = kanbanEligibleColumns.map((column) => ({
  label: processI18n(column.header),
  value: column.accessorKey,
}));

const { displays: registeredDisplays, getById } = useTableViewDisplays();

const offeredDisplayIds = new Set(resolvedDisplays.map((d) => d.id));
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
const persistedDisplay = getPreference<string>(
  getTablePreferenceKey("viewMode"),
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
      : TABLE_DISPLAY_ID,
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
const activeCapabilities = computed(() =>
  resolveDisplayCapabilities(
    resolvedDisplay(activeDisplayId.value)?.capabilities,
  ),
);

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

const kanbanGroupBy = ref<string>(
  getPreference<string>(
    getTablePreferenceKey("kanbanGroupBy"),
    kanbanOptions?.groupByField ?? "",
  ),
);
// A saved preference may point to a column that no longer exists or is no
// longer eligible after a backend config change.
if (
  kanbanOptions &&
  !kanbanEligibleColumns.some((c) => c.accessorKey === kanbanGroupBy.value)
) {
  kanbanGroupBy.value = kanbanOptions.groupByField;
}

const DEFAULT_DENSITY = "default";
// The module's density is the default; the user's pick in the ⋯ menu is kept
// with the rest of the table's state.
const density = ref<"default" | "compact">(
  getPreference(
    getTablePreferenceKey("density"),
    props.density ?? DEFAULT_DENSITY,
  ),
);

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

const paginationState = ref<PaginationState>(
  getPreference<PaginationState>(
    getTablePreferenceKey("pagination"),
    DEFAULT_PAGINATION,
  ),
);
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
const sorting = ref<SortingState>(
  sanitizeSorting(
    getPreference<SortingState>(
      getTablePreferenceKey("sorting"),
      defaultSortState,
    ),
    declaredSortableIds,
  ),
);

const savedFilters = getPreference<TableFilter[]>(
  getTablePreferenceKey("columnFilters"),
  [],
);

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

const columnFilters = ref<TableFilter[]>(initialFilters);
const columnVisibility = ref<VisibilityState>(
  getPreference<VisibilityState>(
    getTablePreferenceKey("columnVisibility"),
    initialVisibility,
  ),
);
const columnSizing = ref<ColumnSizingState>(
  getPreference<ColumnSizingState>(getTablePreferenceKey("columnSizing"), {}),
);
const columnOrder = ref<string[]>(
  getPreference<string[]>(getTablePreferenceKey("columnOrder"), []),
);
const hasEmptyDefaultFilter = (defaultFilters || []).some(
  (f) => f.value === undefined || f.value === null || f.value === "",
);
const filtersRowOpen = ref<boolean>(
  getPreference<boolean>(
    getTablePreferenceKey("filtersOpen"),
    hasEmptyDefaultFilter,
  ),
);
const globalFilter = shallowRef<string>();
const globalFilterDebounced = refDebounced(
  globalFilter,
  GLOBAL_FILTER_DEBOUNCE_MS,
);
const showArchived = ref(false);

const urlScope = {
  tableId: props.tableId,
  isSoleTableView: props.isSoleTableView,
};

// Views: named states of the whole table, the module's and the user's own.
const {
  items: tableViewItems,
  activeViewId,
  isModified: isViewModified,
  canSaveViews,
  openView,
  resetView,
  saveView,
  saveAsNewView,
  deleteView,
} = useTableViews({
  views: props.views,
  defaults: {
    pinnedFilters: (defaultFilters || []).map((filter) => ({
      accessorKey: filter.accessorKey,
      mode: filter.mode,
      value: filter.value,
      pinned: true,
      initialValue: filter.value,
    })),
    sorting: defaultSortState,
    visibility: initialVisibility,
    columnOrder: listableColumns.map(
      (column) => column.id ?? column.accessorKey,
    ),
    display: offeredDisplayIds.has(defaultDisplay)
      ? defaultDisplay
      : TABLE_DISPLAY_ID,
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
  preferenceKey: getTablePreferenceKey,
  urlScope,
});

const ALL_TAB_ID = "all";

const { t, te } = useI18n();

const TAB_URL_KEY = "tab";
const urlTab = readTableUrlKey(useDmsRoute().query, urlScope, TAB_URL_KEY);
// A tab named by the URL wins over the one kept from the last visit.
const activeTabId = ref<string>(
  urlTab.value ??
    getPreference<string>(getTablePreferenceKey("activeTab"), ALL_TAB_ID),
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
  badge?: boolean;
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
      badge: tab.badge,
    })),
  ];
});

const activeTabFilters = computed<TableFilter[]>(() => {
  const tab = resolvedTabs.value.find((t) => t.id === activeTabId.value);
  return tab?.filters || [];
});

watch(resolvedTabs, (next) => {
  if (next.length === 0) return;
  if (!next.some((tab) => !tab.to && tab.id === activeTabId.value)) {
    activeTabId.value = ALL_TAB_ID;
  }
});

const { $authFetch } = useAuthFetch();
const route = useDmsRoute();

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

// Quick filters: dropdowns of the toolbar over a column's values (a select's
// items, a boolean, the rows a relation points to), writing that column's
// filter like the filters row does.
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
    source: relationQuickFilterSource(column),
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
          >(source!.url, { query: { limit: RELATION_QUICK_FILTER_LIMIT } });
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
const effectiveSorting = computed<SortingState>(() => {
  const picked = activeCapabilities.value.sorting
    ? sorting.value
    : defaultSortState;
  return sanitizeSorting(
    isGroupedDisplay.value && groupedOptions
      ? groupedSorting(picked, groupedOptions)
      : picked,
    sortableIds.value,
  );
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

const EMPTY_LIST_RESULT: TableViewListResponse<never> = {
  results: [],
  total: 0,
  offset: 0,
  limit: 0,
};

const tableDataKey = buildTableDataKey({
  componentId,
  pageId,
  query: queryRequest.value,
  archiveQuery: archiveQuery.value,
  isSelfManaged: isActiveDisplaySelfManaged.value,
});

const { data, status, error, refresh } = await useServerRenderedAsyncData(
  tableDataKey,
  (): Promise<TableViewListResponse<T>> => {
    // Self-managed displays (e.g. kanban) fetch their own data; skip the
    // shared list query for them.
    if (isActiveDisplaySelfManaged.value) {
      return Promise.resolve(EMPTY_LIST_RESULT);
    }
    return $authFetch<TableViewListResponse<T>>(location + "/list", {
      query: { ...queryRequest.value, ...archiveQuery.value },
    });
  },
  { watch: [queryRequest, archiveQuery, isActiveDisplaySelfManaged] },
);

// Nothing listed yet (a client navigation paints before the first page
// arrives): the table draws its skeleton, never the empty state.
const isFirstPageLoading = computed(() => data.value === null && !error.value);
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
  if (!error.value) return undefined;
  const message = resolveApiErrorMessage(error.value);
  if (te(`${message}.description`) || te(message)) return message;
  const status = (error.value as { statusCode?: number }).statusCode;
  return status && te(`error.${status}.description`)
    ? `error.${status}`
    : "error.500";
});

// useDmsAsyncData keeps the previous result when a refetch fails, so rows kept
// on screen would masquerade as the newly requested page/filter. Hide them
// while the latest query is in error; the error panel takes their place.
// Every consumer acting on visible rows (table, displays, selection
// shortcuts) must read the shown refs, never `data` directly.
const shownData = computed(() =>
  listLoadError.value ? undefined : data.value,
);
const shownResults = computed(() => shownData.value?.results);

// Rows selected before the failure can no longer be seen or verified, yet the
// selection toolbar would keep offering delete/archive/export on them.
watch(listLoadError, (message) => {
  if (message) rowSelect.value = {};
});

// Whatever sets the sort (a header, the sort menu, a pasted table config), the
// route only ever receives a sort it accepts. A new order lists from page 1:
// the page reached in the previous order shows unrelated rows in the new one.
// Synchronous, so the list is queried once, with both changes.
watch(
  sorting,
  (next, previous) => {
    const sanitized = sanitizeSorting(next, sortableIds.value);
    if (!isSameSorting(sanitized, next)) {
      sorting.value = sanitized;
      return;
    }
    const before = sanitizeSorting(previous, sortableIds.value);
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

// A view's counter shares the tab counters' request, under its own id.
const VIEW_COUNT_ID_PREFIX = "view:";
const countQuery = (filters: TableFilter[], search?: string) =>
  buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 0 },
    sorting: [],
    columnFilters: filters,
    hiddenFilters: queryParamHiddenFilters.value,
    globalFilter: search,
  });

const tabCountsQuery = computed(() => [
  ...resolvedTabs.value
    .filter((tab) => !tab.to)
    .map((tab) => ({ id: tab.id, query: countQuery(tab.filters) })),
  ...tableViewItems.value
    .filter((view) => view.count)
    .map((view) => ({
      id: `${VIEW_COUNT_ID_PREFIX}${view.id}`,
      query: countQuery(view.filters ?? [], view.search),
    })),
]);

// No default: `null` until the counts arrive, so the tabs draw placeholders
// instead of a count of nothing.
const { data: tabCountsData, refresh: refreshTabCounts } =
  await useServerRenderedAsyncData<Record<string, number>>(
    `table-view-${componentId}-${pageId}-tab-counts`,
    async () => {
      if (tabCountsQuery.value.length === 0) return {};
      return await $authFetch<Record<string, number>>(
        location + "/count/batch",
        {
          method: "POST",
          body: {
            queries: tabCountsQuery.value.map(({ id, query }) => ({
              id,
              query: { ...query, ...archiveQuery.value },
            })),
          },
        },
      );
    },
    { watch: [tabCountsQuery, archiveQuery] },
  );

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

const { footer: resolvedFooter, refreshSummaries } = await useTableFooter({
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

const { grouping, refreshCounts: refreshGroupCounts } = useGroupedRows({
  grouped: groupedOptions,
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
  countBatch: (queries) =>
    $authFetch<Record<string, number>>(location + "/count/batch", {
      method: "POST",
      body: { queries },
    }),
});

// Only what the (unchanged) KanbanBoard needs beyond the generic context: the
// two-way group-by ref and the raw action configs for per-row rule evaluation.
provide(KANBAN_DISPLAY_BRIDGE_KEY, {
  groupByField: kanbanGroupBy,
  editAction: tableProps.value.rowActions?.edit,
  deleteAction: tableProps.value.rowActions?.delete,
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
const refreshAll = async () => {
  notifyTableDataChanged(location);
  await Promise.all([
    refresh(),
    refreshTabCounts(),
    refreshLinkTabCounts(),
    refreshGroupCounts(),
    refreshSummaries(),
    activeDisplayRef.value?.refresh?.(),
  ]);
};

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

// A tab declared with `badge` publishes its counter for the navigation entry
// of the page it stands for: the linked page, or this one.
const { setNavBadge } = useNavBadges();
watch(
  tabsWithCount,
  (next) => {
    for (const tab of next) {
      const source = resolvedTabs.value.find((entry) => entry.id === tab.id);
      if (!source?.badge || tab.count === undefined) continue;
      const fullId = source.to ? source.toPage : pageId;
      if (fullId) setNavBadge(fullId, String(tab.count));
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
  runConfirmedBuiltIn,
} = useTableRowActions<T>({
  api: $authFetch,
  location,
  caption,
  labelKey,
  rowIdKey: props.rowIdKey,
  refreshCallback: refreshAll,
  formComponents,
  formContainer,
  formPages,
  routeParams,
  componentId: componentId!,
  pageId: pageId!,
  queryParamFilters,
  rowNavigation: {
    rows: () => (shownResults.value ?? []) as Data[],
    rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
  },
  recordScope: urlScope,
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
const deleteRows = async (ids: string[]) => {
  const done = await deleteRowsAction(
    ids,
    tableProps.value.rowActions?.delete,
    {
      permanently: !!archiveMode && showArchived.value,
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
const handleRowDuplicate = (itemId: string) =>
  runConfirmedBuiltIn(
    rowActionConfig("duplicate"),
    { [props.rowIdKey ?? ROW_ID_DEFAULT_KEY]: itemId },
    () => duplicateRow(itemId),
  );
const handleRowAdd = () =>
  runConfirmedBuiltIn(rowActionConfig("add"), undefined, () =>
    newRow(queryParamDefaults.value),
  );

const rowIdKey = props.rowIdKey ?? ROW_ID_DEFAULT_KEY;
const realtimeRowTopic = computed(() =>
  location ? `${REALTIME_ROW_TOPIC_PREFIX}${location}` : undefined,
);
const realtimePresenceTopic = computed(() =>
  location ? `${REALTIME_PRESENCE_TOPIC_PREFIX}${location}` : undefined,
);

const presenceByRow = ref<RealtimePresenceMap>({});
const { user: realtimeUser } = useUserSession();

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
    const fresh = await $authFetch<T>(`${location}/get`, { query: { id } });
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
  [REALTIME_EVENT_TYPE.UPDATED]: async (ids) => {
    if (isActiveDisplaySelfManaged.value) {
      await activeDisplayRef.value?.refresh?.();
      return;
    }
    await Promise.all(ids.map((id) => patchRowLocal(id)));
  },
};

useRealtimeTopic(realtimeRowTopic, (event) => {
  const payload = event as { type: string; payload?: { ids?: string[] } };
  const handler = realtimeEventHandlers[payload.type];
  if (!handler) return;
  const ids = payload.payload?.ids ?? [];
  if (ids.length === 0 && payload.type !== REALTIME_EVENT_TYPE.CREATED) return;
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

let expandedQueryKey: string | undefined;
if (expandableConfig) {
  watch(
    shownResults,
    (rows) => {
      const queryKey = JSON.stringify([queryRequest.value, archiveQuery.value]);
      if (queryKey === expandedQueryKey) {
        expanded.value = keepListedRows(expanded.value, rowIdsOf(rows));
        return;
      }
      expandedQueryKey = queryKey;
      expanded.value = defaultExpandedRows(
        rowIdsOf(rows),
        expandableConfig.defaultExpanded,
        expandableConfig.single,
      );
    },
    { immediate: true },
  );
}

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

// A deep-linked action reopens on the row the URL names, listed or not.
const deepLinkAction = (tableProps.value.rowActions?.custom ?? []).find(
  (action) => action.deepLink,
);
const openRecordFromUrl = async () => {
  const id = deepLinkAction ? readRecordId(route.query, urlScope) : undefined;
  if (!deepLinkAction || !id) return;
  const listed = shownResults.value?.find((row) => getRowId(row) === id);
  const row =
    listed ??
    (await $authFetch<T>(`${location}/get`, { query: { id } }).catch(
      () => undefined,
    ));
  if (row) handleCustomRowAction(deepLinkAction, row as Data);
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
    refresh: refreshAll,
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
    refresh: refreshAll,
    tableProps,
    newRow: () => newRow(queryParamDefaults.value),
    globalFilter,
    rowSelect,
    data: shownData,
    activeElement: useActiveElement(),
  }),
);

const tableStatePreferences = {
  sorting,
  pagination: paginationState,
  columnFilters: columnFilters,
  columnVisibility,
  filtersOpen: filtersRowOpen,
  activeTab: activeTabId,
  viewMode: activeDisplayId,
  columnOrder,
  kanbanGroupBy,
  density,
} as const;

Object.entries(tableStatePreferences).forEach(([key, ref]) => {
  watch(
    ref,
    (newValue) => {
      setPreference(getTablePreferenceKey(key), newValue);
    },
    { deep: true },
  );
});

// Resizing fires on every mousemove (columnResizeMode "onChange"); debounce so
// the preference cookie is only written once the drag settles.
const COLUMN_SIZING_PERSIST_DEBOUNCE_MS = 500;
let pendingColumnSizingWrite = false;

const persistColumnSizing = () => {
  setPreference(getTablePreferenceKey("columnSizing"), columnSizing.value);
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
  void openRecordFromUrl();
  void loadRelationQuickFilters();
  void refreshLinkTabCounts();
  // The registry is client-only; once hydrated, degrade to the table display if
  // the active id is no longer available (e.g. kanban with no eligible column).
  if (
    activeDisplayId.value !== TABLE_DISPLAY_ID &&
    !isConfigRenderedDisplay(activeDisplayId.value) &&
    !availableDisplays.value.some((d) => d.id === activeDisplayId.value)
  ) {
    activeDisplayId.value = TABLE_DISPLAY_ID;
  }
});
</script>

<template>
  <UTable
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
    v-model:show-archived="showArchived"
    v-model:expanded="expandedModel"
    v-model:density="density"
    :chrome="resolvedChrome"
    :grouping="grouping"
    :accumulation="accumulation"
    :views-placement="viewsLayout === 'menu' ? 'header' : 'band'"
    :search-placeholder="props.searchPlaceholder"
    :quick-filters="resolvedQuickFilters"
    :footer="resolvedFooter"
    :empty-states="props.emptyStates"
    :default-page-size="props.pageSize"
    :archive-toggle="canToggleArchived"
    :displays="availableDisplays"
    :active-capabilities="activeCapabilities"
    :kanban-group-by-options="kanbanGroupByOptions"
    :tabs="tabsWithCount"
    :initial-column-visibility="initialVisibility"
    :loading="isListLoading"
    :load-error="listLoadError"
    :data="shownResults || []"
    :pagination-options="{ manualPagination: true, rowCount: data?.total }"
    :sorting-options="{ manualSorting: true }"
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
    @add="handleRowAdd"
    @refresh="refreshAll"
    @details="handleRowClick"
    @delete="(e) => deleteRows(e)"
    @archive="(e) => archiveRows(e)"
    @restore="(e) => restoreRows(e)"
    @export="handleExportSelection"
    @export-all="handleExportTable"
    @bulk-action="runBulkAction"
    @duplicate="handleRowDuplicate"
    @edit="handleRowEdit"
  >
    <template v-if="hasViews" #views>
      <TableViews
        :items="viewItems"
        :active-id="activeViewId"
        :layout="viewsLayout"
        :modified="isViewModified"
        :can-save-as="canSaveViews"
        :divided="tabsWithCount.length === 0"
        @open="openView"
        @reset="resetView"
        @save="saveView"
        @save-as="saveAsNewView"
        @delete="deleteView"
      />
    </template>
    <template v-if="expandableConfig" #expanded="{ row }">
      <ExpandedRowDetail
        :row="row.original"
        :row-id="row.id"
        :columns="props.columns"
        :config="expandableConfig"
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
