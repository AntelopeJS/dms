import type { TableProps, Data } from "../../../types/table";
import type {
  TableViewConfig,
  TableViewDisplayConfig,
} from "../../../composables/table-view/types";
import {
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
} from "../../../composables/table-view/types";
import type { FormContainerType } from "./types";

const BUILTIN_DISPLAYS: Record<
  string,
  Pick<TableViewDisplayConfig, "selfManagedData" | "capabilities">
> = {
  [TABLE_DISPLAY_ID]: { capabilities: { columnManagement: true } },
  [KANBAN_DISPLAY_ID]: { selfManagedData: true, capabilities: { tabs: false } },
};

const withBuiltinDefaults = (
  entry: TableViewDisplayConfig,
): TableViewDisplayConfig => {
  const builtin = BUILTIN_DISPLAYS[entry.id];
  if (!builtin) return entry;
  // Per-key merge so a partial override (e.g. kanban { filters: false }) keeps
  // the other built-in defaults (e.g. tabs: false) instead of dropping them.
  const capabilities =
    entry.capabilities || builtin.capabilities
      ? { ...builtin.capabilities, ...entry.capabilities }
      : undefined;
  return {
    ...entry,
    selfManagedData: entry.selfManagedData ?? builtin.selfManagedData,
    capabilities,
  };
};

export interface FormContainer {
  type: FormContainerType;
  size?: ModalSize;
  pages?: {
    new?: { urlSlug?: string; displayName?: string; description?: string };
    edit?: { urlSlug?: string; displayName?: string; description?: string };
    view?: { urlSlug?: string; displayName?: string; description?: string };
  };
}

export const useTableViewConfig = <T extends Data>(
  config: TableViewConfig<T>,
) => {
  const { processI18n } = useTranslation();

  const allColumns = computed(() => config.columns);

  const listableColumns = computed(() =>
    allColumns.value
      .filter((col) => col.listable)
      .map((col) => ({
        ...col,
        header: processI18n(col.header),
      })),
  );

  // Config-derived (SSR-safe; the registry is client-only): the implicit `table`
  // display plus explicit `displays`. Built-in defaults
  // (selfManagedData/capabilities) are merged per id.
  const resolvedDisplays: TableViewDisplayConfig[] = (() => {
    const list: TableViewDisplayConfig[] = [{ id: TABLE_DISPLAY_ID }];
    for (const display of config.displays ?? []) {
      if (display.id === TABLE_DISPLAY_ID) continue;
      list.push(display);
    }
    return list.map(withBuiltinDefaults);
  })();

  const defaultDisplay = config.defaultDisplay ?? TABLE_DISPLAY_ID;

  const initialVisibility = config.columns?.reduce(
    (acc, column) => {
      acc[column.id] = column.visible ?? true;
      return acc;
    },
    {} as Record<string, boolean>,
  );

  const tableProps = computed<Partial<TableProps<T>>>(() => ({
    caption: processI18n(config.caption ?? ""),
    rowIdKey: config.rowIdKey,
    rowActions: config.rowActions,
    customNavItems: config.customNavItems,
    componentId: config.componentId,
    formContainer: config.formContainer,
    data: config.data,
    loading: config.loading,
    orderOptions: config.orderOptions,
    sizingOptions: config.sizingOptions,
    globalFilterOptions: config.globalFilterOptions,
    columnFiltersOptions: config.columnFiltersOptions,
    sortingOptions: config.sortingOptions,
    expandedOptions: config.expandedOptions,
    rowSelectionOptions: config.rowSelectionOptions,
    paginationOptions: config.paginationOptions,
    defaultSort: config.defaultSort,
  }));

  return {
    allColumns: allColumns.value,
    listableColumns: listableColumns.value,
    initialVisibility,
    tableProps,
    location: config.location,
    caption: config.caption,
    labelKey: config.labelKey,
    enableTableExport: config.enableTableExport,
    archiveMode: config.archiveMode,
    defaultFilters: config.defaultFilters,
    customButtons: config.customButtons,
    formComponents: config.formComponents,
    formContainer: config.formContainer,
    componentId: config.componentId,
    pageId: config.pageId,
    defaultSort: config.defaultSort,
    queryParamFilters: config.queryParamFilters,
    routeParamFilters: config.routeParamFilters,
    routeParams: config.routeParams,
    tabs: config.tabs,
    resolvedDisplays,
    defaultDisplay,
  };
};
