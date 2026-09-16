<script setup lang="ts" generic="T extends Data">
import type {
  ColumnSizingState,
  PaginationState,
  RowSelectionState,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/vue-table";
import { refDebounced, watchDebounced } from "@vueuse/core";
import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
} from "../../types/quick-actions";
import type {
  KanbanConfig,
  TableViewConfig,
  TableViewListResponse,
  TableViewDisplayContext,
  TableViewDisplayConfig,
} from "../../composables/table-view/types";
import {
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
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

import UTable from "../../build/components/table/Table.vue";
import type { TableViewSwitcherItem } from "../../build/components/table/Table.vue";
import {
  defineAsyncComponent,
  type Component,
  type WatchOptions,
  type WatchSource,
} from "vue";
import { useTableViewConfig } from "../../build/composables/table-view/useTableViewConfig";

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

interface TableViewProps<T extends Data> extends TableViewConfig<T> {}

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

// Stored under the legacy "viewMode" key (free migration of "table"/"kanban");
// clamped to the offered set so a stale/removed id never renders an un-offered display.
const persistedDisplay = getPreference<string>(
  getTablePreferenceKey("viewMode"),
  defaultDisplay,
);
const activeDisplayId = ref<string>(
  offeredDisplayIds.has(persistedDisplay) ? persistedDisplay : TABLE_DISPLAY_ID,
);

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
  const registered = getById(id)?.component;
  if (registered) return resolveDisplayComponentRef(registered);
  const fromConfig = resolvedDisplay(id)?.component;
  if (fromConfig) return resolveDisplayComponentRef(fromConfig);
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

const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 10 };
const GLOBAL_FILTER_DEBOUNCE_MS = 400;

const pagination = ref<PaginationState>(
  getPreference<PaginationState>(
    getTablePreferenceKey("pagination"),
    DEFAULT_PAGINATION,
  ),
);
const rowSelect = ref<RowSelectionState>({});
const defaultSortState: SortingState = defaultSort
  ? [{ id: defaultSort.field, desc: defaultSort.desc ?? false }]
  : [];
const sorting = ref<SortingState>(
  getPreference<SortingState>(
    getTablePreferenceKey("sorting"),
    defaultSortState,
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

const ALL_TAB_ID = "all";

const { t, te } = useI18n();

const activeTabId = ref<string>(
  getPreference<string>(getTablePreferenceKey("activeTab"), ALL_TAB_ID),
);

interface ResolvedTab {
  id: string;
  label: string;
  filters: TableFilter[];
  icon?: string;
  textColor?: string;
  iconColor?: string;
}

const resolvedTabs = computed<ResolvedTab[]>(() => {
  // Tabs are a transverse-but-table-shaped concept; displays that opt out of the
  // `tabs` capability (e.g. kanban) hide them and have their own grouping.
  if (!activeCapabilities.value.tabs) return [];
  if (!tabs || tabs.length === 0) return [];
  return [
    {
      id: ALL_TAB_ID,
      label: t("dms.table.tabs.all"),
      filters: [] as TableFilter[],
      icon: undefined,
      textColor: undefined,
      iconColor: undefined,
    },
    ...tabs.map((tab) => ({
      id: tab.id,
      label: processI18n(tab.label),
      filters: tab.filters.map((f) => ({ ...f })),
      icon: tab.icon,
      textColor: tab.textColor,
      iconColor: tab.iconColor,
    })),
  ];
});

const activeTabFilters = computed<TableFilter[]>(() => {
  const tab = resolvedTabs.value.find((t) => t.id === activeTabId.value);
  return tab?.filters || [];
});

watch(resolvedTabs, (next) => {
  if (next.length === 0) return;
  if (!next.some((tab) => tab.id === activeTabId.value)) {
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
const effectiveSorting = computed<SortingState>(() =>
  activeCapabilities.value.sorting ? sorting.value : defaultSortState,
);

const queryRequest = computed(() =>
  buildTableQuery({
    pagination: pagination.value,
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

const { data, status, error, refresh } = await useDmsAsyncData(
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

// A non-self-managed display consumes the shared query, and nothing
// guarantees it knows how to render a failure. While that query is in error,
// fall back to the table body so the error panel and its retry replace the
// display instead of letting it show blank content.
const activeDisplayBlockedByError = computed(
  () => !!listLoadError.value && !isActiveDisplaySelfManaged.value,
);

watch(
  [() => data.value?.total, () => pagination.value.pageSize],
  ([total, pageSize]) => {
    if (total === undefined || total === null || pageSize <= 0) return;
    const maxPageIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (pagination.value.pageIndex > maxPageIndex) {
      pagination.value = { ...pagination.value, pageIndex: maxPageIndex };
    }
  },
);

const tabCountsQuery = computed(() =>
  resolvedTabs.value.map((tab) => ({
    id: tab.id,
    query: buildTableQuery({
      pagination: { pageIndex: 0, pageSize: 0 },
      sorting: [],
      columnFilters: [],
      hiddenFilters: [...queryParamHiddenFilters.value, ...tab.filters],
    }),
  })),
);

const { data: tabCountsData, refresh: refreshTabCounts } =
  await useDmsAsyncData<Record<string, number>>(
    `table-view-${componentId}-${pageId}-tab-counts`,
    async () => {
      if (resolvedTabs.value.length === 0) return {};
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
    { watch: [tabCountsQuery, archiveQuery], default: () => ({}) },
  );

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

// Only what the (unchanged) KanbanBoard needs beyond the generic context: the
// two-way group-by ref and the raw action configs for per-row rule evaluation.
provide(KANBAN_DISPLAY_BRIDGE_KEY, {
  groupByField: kanbanGroupBy,
  editAction: tableProps.value.rowActions?.edit,
  deleteAction: tableProps.value.rowActions?.delete,
});

const refreshAll = async () => {
  await Promise.all([
    refresh(),
    refreshTabCounts(),
    activeDisplayRef.value?.refresh?.(),
  ]);
};

const tabsWithCount = computed(() =>
  resolvedTabs.value.map((tab) => ({
    id: tab.id,
    label: tab.label,
    count: tabCountsData.value?.[tab.id],
    icon: tab.icon,
    textColor: tab.textColor,
    iconColor: tab.iconColor,
  })),
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
} = useTableRowActions<T>({
  api: $authFetch,
  location,
  caption,
  labelKey,
  rowIdKey: props.rowIdKey,
  refreshCallback: refreshAll,
  formComponents,
  formContainer,
  componentId: componentId!,
  pageId: pageId!,
  queryParamFilters,
});

const customNavItems = computed(() => {
  const items = [];

  const hasViewArchivedPermission =
    tableProps.value.rowActions?.showArchived === true;

  if (archiveMode && hasViewArchivedPermission) {
    items.push({
      label: showArchived.value
        ? t("dms.table.show_active")
        : t("dms.table.show_archived"),
      icon: showArchived.value ? "i-ph-folder-open" : "i-ph-archive",
      onSelect: () => {
        showArchived.value = !showArchived.value;
      },
    });
  }

  if (enableTableExport) {
    items.push({
      label: t("dms.button.export_data"),
      icon: "i-ph-export",
      onSelect: () => handleExportTable(),
    });
  }

  return items;
});

const deleteRows = (ids: string[]) =>
  deleteRowsAction(ids, tableProps.value.rowActions?.delete);

const archiveRows = (ids: string[]) =>
  archiveRowsAction(ids, tableProps.value.rowActions?.archive);

const restoreRows = (ids: string[]) =>
  restoreRowsAction(ids, tableProps.value.rowActions?.restore);

const handleExportTable = () =>
  exportTable(location, { ...queryRequest.value, ...archiveQuery.value });
const handleExportSelection = (ids: string[]) =>
  exportTable(location, queryRequest.value, ids);
const handleRowClick = (item: T) => openRow(item);
const handleRowDuplicate = (itemId: string) => duplicateRow(itemId);
const handleRowAdd = () => newRow(queryParamDefaults.value);

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

const { warnBeforeEdit } = usePresenceEditWarning();

const handleRowEdit = async (item: T) => {
  const itemId = getRowId(item);
  if (itemId) {
    const others = otherEditorsForRow(itemId);
    if (others.length > 0 && !(await warnBeforeEdit(others))) return;
  }
  return editRow(item, queryParamDefaults.value);
};

const EMPTY_ITEMS: T[] = [];

const selectedIds = computed(() =>
  Object.keys(rowSelect.value).filter((key) => rowSelect.value[key]),
);

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
    pagination.value = { ...pagination.value, pageIndex: index };
  },
  setPageSize: (size: number) => {
    pagination.value = { ...pagination.value, pageSize: size, pageIndex: 0 };
  },
};

const displayRowActions = {
  add: handleRowAdd,
  edit: handleRowEdit,
  delete: deleteRows,
  duplicate: handleRowDuplicate,
  details: handleRowClick,
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
    loading: status.value === "pending",
    selection: { ids: selectedIds.value, ...displaySelection },
    pagination: {
      pageIndex: pagination.value.pageIndex,
      pageSize: pagination.value.pageSize,
      total: data.value?.total ?? 0,
      ...displayPagination,
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
    ...rest
  } = route.query;
  await router.replace({ query: rest });
}

// A page may mount several table views, so the quick action always names the
// one it means — resolved server-side — and only that one answers.
function isQuickActionTarget(): boolean {
  return route.query[QUICK_ACTION_COMPONENT_KEY] === componentId;
}

watch(
  () => route.query[QUICK_ACTION_QUERY_KEY],
  async (value) => {
    if (value !== QUICK_ACTION_ADD) return;
    if (!isQuickActionTarget()) return;
    await clearQuickActionQuery();
    handleRowAdd();
  },
  { immediate: true },
);

defineShortcuts(
  buildTableViewShortcuts({
    refresh: refreshAll,
    tableProps,
    newRow: () => newRow(queryParamDefaults.value),
    globalFilter,
    rowSelect,
    data: shownData,
  }),
);

const tableStatePreferences = {
  sorting,
  pagination,
  columnFilters: columnFilters,
  columnVisibility,
  filtersOpen: filtersRowOpen,
  activeTab: activeTabId,
  viewMode: activeDisplayId,
  kanbanGroupBy,
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
      selectedIds: Object.keys(selection).filter((key) => selection[key]),
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
  // The registry is client-only; once hydrated, degrade to the table display if
  // the active id is no longer available (e.g. kanban with no eligible column).
  if (
    activeDisplayId.value !== TABLE_DISPLAY_ID &&
    !availableDisplays.value.some((d) => d.id === activeDisplayId.value)
  ) {
    activeDisplayId.value = TABLE_DISPLAY_ID;
  }
});
</script>

<template>
  <UTable
    v-bind="tableProps"
    v-model:pagination="pagination"
    v-model:global-filter="globalFilter"
    v-model:sorting="sorting"
    v-model:row-selection="rowSelect"
    v-model:column-filters="columnFilters"
    v-model:column-visibility="columnVisibility"
    v-model:column-sizing="columnSizing"
    v-model:filters-row-open="filtersRowOpen"
    v-model:active-tab="activeTabId"
    v-model:active-display="activeDisplayId"
    v-model:kanban-group-by="kanbanGroupBy"
    :displays="availableDisplays"
    :active-capabilities="activeCapabilities"
    :kanban-group-by-options="kanbanGroupByOptions"
    :tabs="tabsWithCount"
    :initial-column-visibility="initialVisibility"
    :loading="status === 'pending'"
    :load-error="listLoadError"
    :data="shownResults || []"
    :pagination-options="{ manualPagination: true, rowCount: data?.total }"
    :sorting-options="{ manualSorting: true }"
    :global-filter-options="{ enableGlobalFilter: false }"
    :columns="listableColumns"
    :custom-nav-items="customNavItems"
    :custom-buttons="customButtons"
    :enable-export="enableTableExport"
    :on-custom-button="handleCustomButton"
    :on-custom-row-action="handleCustomRowAction"
    :presence-by-row="presenceByRowFiltered"
    @add="handleRowAdd"
    @refresh="refreshAll"
    @details="handleRowClick"
    @delete="(e) => deleteRows(e)"
    @archive="(e) => archiveRows(e)"
    @restore="(e) => restoreRows(e)"
    @export="handleExportSelection"
    @duplicate="handleRowDuplicate"
    @edit="handleRowEdit"
  >
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
