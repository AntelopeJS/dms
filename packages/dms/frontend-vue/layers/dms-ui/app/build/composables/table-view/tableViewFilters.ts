import type {
  ColumnSizingState,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/vue-table";
import { refDebounced } from "@vueuse/core";
import type { TableUrlFilter } from "../../components/table/Table.vue";
import {
  currentQuery,
  visibleUrlFilters,
  withoutQueryParam,
} from "./utils/urlFilters";
import { usePersistedPagination } from "./usePersistedPagination";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewUrlFilters<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "configuration" | "arrival" | "displayPreferences" | "deferred"
  >,
) {
  const { queryParamFilters, routeParamFilters, routeParams, allColumns } =
    scope.configuration;
  const { route, tablePreferences, processI18n } = scope.arrival;
  const { DEFAULT_PAGINATION } = scope.displayPreferences;
  const { deferred } = scope;
  const DEFAULT_FILTER_MODE = "is";

  const queryParamHiddenFilters = computed<TableFilter[]>(() => {
    if (!queryParamFilters) return [];

    return Object.entries(queryParamFilters)
      .filter(([param]) => route.query[param] !== undefined)
      .map(([param, config]) => ({
        accessorKey: config.field,
        mode: config.mode || DEFAULT_FILTER_MODE,
        value: route.query[param],
      }));
  });

  const shownUrlFilters = computed<TableUrlFilter[]>(() =>
    visibleUrlFilters(queryParamFilters, route.query),
  );

  const removeUrlFilter = (param: string) =>
    deferred.router.replace({
      query: withoutQueryParam(currentQuery(route.query), param),
    });

  const routeParamHiddenFilters = computed<TableFilter[]>(() => {
    if (!routeParamFilters || !routeParams) return [];

    return Object.entries(routeParamFilters)
      .filter(([param]) => routeParams[param] !== undefined)
      .map(([param, config]) => ({
        accessorKey: config.field,
        mode: config.mode || DEFAULT_FILTER_MODE,
        value: routeParams[param],
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
  return {
    paginationState,
    columnLabel,
    queryParamHiddenFilters,
    routeParamHiddenFilters,
    rowSelect,
    shownUrlFilters,
    removeUrlFilter,
  };
}

export function useTableViewPinnedFilters<T extends Data>(
  scope: Pick<TableViewScope<T>, "arrival" | "configuration">,
) {
  const { tablePreferences } = scope.arrival;
  const { defaultFilters } = scope.configuration;
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
  return { initialFilters, pinnedDefaultFilters };
}

export function useTableViewFilterState<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "pinnedFilters"
    | "arrival"
    | "configuration"
    | "displayPreferences"
    | "displayOptions"
  >,
) {
  const { initialFilters } = scope.pinnedFilters;
  const { tablePreferences } = scope.arrival;
  const { initialVisibility, defaultFilters, defaultDisplay } =
    scope.configuration;
  const { GLOBAL_FILTER_DEBOUNCE_MS } = scope.displayPreferences;
  const { offeredDisplayIds, fallbackDisplayId } = scope.displayOptions;
  const columnFilters = ref<TableFilter[]>(initialFilters);
  const columnVisibility = ref<VisibilityState>(
    tablePreferences.get<VisibilityState>(
      "columnVisibility",
      initialVisibility,
    ),
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
  return {
    columnFilters,
    displayDefault,
    globalFilter,
    columnVisibility,
    columnOrder,
    globalFilterDebounced,
    showArchived,
    filtersRowOpen,
    hasEmptyDefaultFilter,
    columnSizing,
  };
}

export function useTableViewQueryFilters<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "urlFilters" | "tabs" | "configuration" | "arrival"
  >,
) {
  const { queryParamHiddenFilters, routeParamHiddenFilters } = scope.urlFilters;
  const { activeTabFilters } = scope.tabs;
  const { queryParamFilters, routeParamFilters, routeParams } =
    scope.configuration;
  const { route } = scope.arrival;
  const hiddenFilters = computed<TableFilter[]>(() => [
    ...queryParamHiddenFilters.value,
    ...routeParamHiddenFilters.value,
    ...activeTabFilters.value,
  ]);

  const queryParamDefaults = computed(() => {
    if (!queryParamFilters && !routeParamFilters) return undefined;

    const defaults: Record<string, (typeof route.query)[string]> = {};
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
  return { hiddenFilters, queryParamDefaults };
}
