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

const VALUE_MODE = "is";
const NOT_VALUE_MODE = "is_not";
const NOT_EMPTY_MODE = "is_not_empty";

/**
 * Whether a column's `<mode>:<value>` filter keeps only rows its hidden
 * filter keeps too: an equal filter, or `is:a` under `is_not:b` (a ≠ b) or
 * `is_not_empty`.
 */
const isNarrowerFilter = (column: string, hidden: string): boolean => {
  if (column === hidden) return true;
  if (!column.startsWith(`${VALUE_MODE}:`)) return false;
  if (hidden.startsWith(`${NOT_EMPTY_MODE}:`)) return true;
  return (
    hidden.startsWith(`${NOT_VALUE_MODE}:`) &&
    hidden.slice(NOT_VALUE_MODE.length) !== column.slice(VALUE_MODE.length)
  );
};

/**
 * The column filters (the filters row, a saved view) laid over the hidden
 * ones (a tab, a route or query parameter). The list query carries one
 * filter per column, so two filters on one column cannot both be sent: the
 * column filter is sent only when it implies the hidden one, and the hidden
 * filter otherwise. A scope the page sets is never widened by a filter the
 * user picks — a tab stays what it says, combined (AND) with the filters of
 * the other columns.
 */
const combineFilters = (
  hidden: Record<string, string>,
  column: Record<string, string>,
): Record<string, string> => {
  const combined = { ...hidden };
  for (const [key, value] of Object.entries(column)) {
    if (!(key in hidden) || isNarrowerFilter(value, hidden[key]!)) {
      combined[key] = value;
    }
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
