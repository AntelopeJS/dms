import type { PaginationState, SortingState } from "@tanstack/vue-table";
import type { TableFilter } from "../../../components/table/Table.vue";

interface QueryConfig {
  pagination: PaginationState;
  sorting: SortingState;
  columnFilters: TableFilter[];
  hiddenFilters?: TableFilter[];
  globalFilter?: string;
}

interface TableDataKeyConfig {
  /** Undefined on a table view rendered outside a registered page component. */
  componentId: string | undefined;
  pageId: string | undefined;
  /** Serialized as-is; the key only has to change when the request changes. */
  query: unknown;
  archiveQuery: unknown;
  isSelfManaged: boolean;
  /** The resolved URL of a `TableView.fromSource` table. */
  sourceUrl?: string;
}

const NO_VALUE_COMPARE_MODES = new Set(["is_empty", "is_not_empty"]);

export const isFilterEffective = (filter: TableFilter): boolean => {
  if (NO_VALUE_COMPARE_MODES.has(filter.mode)) return true;
  const value = filter.value;
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value === "") return false;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    if (value.some((v) => v === undefined || v === null || v === "")) {
      return false;
    }
  }
  return true;
};

const buildFiltersQuery = (filters: TableFilter[]): Record<string, string> => {
  return filters.filter(isFilterEffective).reduce(
    (acc, val) => {
      acc[`filter_${val.accessorKey}`] = `${val.mode}:${val.value}`;
      return acc;
    },
    {} as Record<string, string>,
  );
};

/**
 * The column filters (the filters row, a saved view) laid over the hidden
 * ones (a tab, a route or query parameter). On a column both filter, both
 * are sent: the list route keeps the rows passing every filter of a column
 * (AND), so a tab never lists rows it excludes, and two filters no row can
 * pass list nothing.
 */
const combineFilters = (
  hidden: Record<string, string>,
  column: Record<string, string>,
): Record<string, string | string[]> => {
  const combined: Record<string, string | string[]> = { ...hidden };
  for (const [key, value] of Object.entries(column)) {
    const hiddenValue = hidden[key];
    combined[key] =
      hiddenValue === undefined || hiddenValue === value
        ? value
        : [hiddenValue, value];
  }
  return combined;
};

export const buildTableQuery = (config: QueryConfig): TableQueryParams => {
  const pageSize = config.pagination.pageSize;
  const activeSort = config.sorting[0];

  const filters = combineFilters(
    buildFiltersQuery(config.hiddenFilters || []),
    buildFiltersQuery(config.columnFilters),
  );

  return {
    ...filters,
    search: config.globalFilter ?? undefined,
    offset: config.pagination.pageIndex * pageSize,
    limit: pageSize,
    sortKey: activeSort?.id ? activeSort.id : undefined,
    sortDirection: activeSort?.id
      ? activeSort.desc
        ? SortDirection.desc
        : SortDirection.asc
      : undefined,
  };
};

export const buildTableDataKey = (config: TableDataKeyConfig): string =>
  `table-view-${config.componentId}-${config.pageId}-${JSON.stringify({
    query: config.query,
    archiveQuery: config.archiveQuery,
    isSelfManaged: config.isSelfManaged,
    sourceUrl: config.sourceUrl,
  })}`;
