import { isObject } from "../../../../../dms-core/app/utils/type-check";

import type { PaginationState } from "@tanstack/vue-table";
import type {
  KanbanConfig,
  TableViewDisplayConfig,
  TableViewGroupedConfig,
} from "../../../composables/table-view/types";
import {
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
} from "../../../composables/table-view/types";
import { isEligibleKanbanColumn } from "../../../composables/table-view/kanban";
import { resolveTableChrome } from "./utils/chrome";
import type { TableViewSwitcherItem } from "../../components/table/Table.vue";
import { type Component } from "vue";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewDisplayOptions<T extends Data>(
  scope: Pick<TableViewScope<T>, "configuration" | "arrival">,
) {
  const { allColumns, resolvedDisplays, defaultDisplay } = scope.configuration;
  const { processI18n, tablePreferences } = scope.arrival;
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
  const optionsForDisplay = (id: string) => resolvedDisplay(id)?.options;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Display options are not discriminated by id in TableViewDisplayConfig; the existing kanban contract remains unchecked here.
  const kanbanOptions = optionsForDisplay(KANBAN_DISPLAY_ID) as
    | KanbanConfig
    | undefined;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Display options are not discriminated by id in TableViewDisplayConfig; the existing grouped contract remains unchecked here.
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
  return {
    resolvedDisplay,
    activeDisplayId,
    offeredDisplayIds,
    getById,
    kanbanOptions,
    kanbanEligibleColumns,
    groupedOptions,
    fallbackDisplayId,
    isDefaultDisplayStandalone,
    optionsForDisplay,
    isConfigRenderedDisplay,
    availableDisplays,
    kanbanGroupByOptions,
  };
}

export function useTableViewDisplayComponent<T extends Data>(
  scope: Pick<TableViewScope<T>, "displayOptions" | "configuration" | "props">,
) {
  const { resolvedDisplay, activeDisplayId, offeredDisplayIds, getById } =
    scope.displayOptions;
  const { KanbanDisplay } = scope.configuration;
  const { props } = scope;
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

  const STATIC_DISPLAY_COMPONENTS: Record<
    TableViewDisplayConfig["id"],
    Component
  > = {
    [KANBAN_DISPLAY_ID]: KanbanDisplay,
  };

  const resolveDisplayComponentRef = (
    component: Component | ComponentInfo | undefined,
  ): Component | string | undefined => {
    if (!component) return undefined;
    if (isObject(component) && "componentName" in component) {
      const name = component.componentName;
      return name ? resolveDmsComponent(name) || name : undefined;
    }
    return component;
  };

  const activeDisplayComponent = computed<Component | string | undefined>(
    () => {
      const id = activeDisplayId.value;
      if (id === TABLE_DISPLAY_ID || !offeredDisplayIds.has(id))
        return undefined;

      const fromConfig = resolvedDisplay(id)?.component;
      if (fromConfig) return resolveDisplayComponentRef(fromConfig);
      const registered = getById(id)?.component;
      if (registered) return resolveDisplayComponentRef(registered);
      return STATIC_DISPLAY_COMPONENTS[id];
    },
  );
  return {
    reorderConfig,
    activeCapabilities,
    isActiveDisplaySelfManaged,
    activeDisplayComponent,
  };
}

export function useTableViewDisplayPreferences<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "displayOptions" | "arrival" | "configuration" | "props"
  >,
) {
  const { kanbanOptions, kanbanEligibleColumns } = scope.displayOptions;
  const { tablePreferences } = scope.arrival;
  const { caption, allColumns } = scope.configuration;
  const { props } = scope;
  const defaultKanbanGroupBy = kanbanOptions?.groupByField ?? "";
  const kanbanGroupBy = ref<string>(defaultKanbanGroupBy);

  tablePreferences.restore(
    "kanbanGroupBy",
    kanbanGroupBy,
    (field) =>
      !kanbanOptions ||
      kanbanEligibleColumns.some((c) => c.accessorKey === field),
  );

  const DEFAULT_DENSITY = "default" as const;

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
  return {
    DEFAULT_PAGINATION,
    GLOBAL_FILTER_DEBOUNCE_MS,
    DEFAULT_DENSITY,
    density,
    kanbanGroupBy,
    defaultKanbanGroupBy,
    defaultDensity,
    resolvedChrome,
  };
}
