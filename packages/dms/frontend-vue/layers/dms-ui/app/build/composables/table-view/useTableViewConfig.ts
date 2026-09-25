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

// The per-page slugs the table view declares are resolved server-side and
// arrive as `formPages`; the frontend never reads them.
export interface FormContainer {
  type: FormContainerType;
  size?: ModalSize;
}

/**
 * Page-mode form URLs resolved by the server, placeholders included: the `:id`
 * of the row, and those the slug of the carrying page contributes.
 */
export interface FormPageUrls {
  new: string;
  edit: string;
  view: string;
}

const ROW_ID_PLACEHOLDER = ":id";

/**
 * Turn a serialized form page URL into the one to navigate to. The row id
 * takes the last `:id` — the form slug contributes it after the slug of the
 * carrying page, so an earlier one belongs to that page — and the params of
 * the current route fill whatever placeholder is left.
 */
export const fillFormPageUrl = (
  url: string,
  routeParams?: Record<string, string>,
  itemId?: string,
): string => {
  let filled = url;
  const rowIdAt =
    itemId === undefined ? -1 : url.lastIndexOf(ROW_ID_PLACEHOLDER);
  if (rowIdAt >= 0) {
    filled =
      url.slice(0, rowIdAt) +
      itemId +
      url.slice(rowIdAt + ROW_ID_PLACEHOLDER.length);
  }
  for (const [param, value] of Object.entries(routeParams ?? {})) {
    filled = filled.replace(new RegExp(`:${param}(?![\\w])`, "g"), value);
  }
  return filled;
};

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
    formPages: config.formPages,
    routeParams: config.routeParams,
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
    tabCountMode: config.tabCountMode,
    archiveMode: config.archiveMode,
    defaultFilters: config.defaultFilters,
    customButtons: config.customButtons,
    formComponents: config.formComponents,
    formContainer: config.formContainer,
    formPages: config.formPages,
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
