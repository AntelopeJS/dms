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
}

const NO_VALUE_COMPARE_MODES = new Set(["is_empty", "is_not_empty"]);

const isFilterEffective = (filter: TableFilter): boolean => {
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

export const buildTableQuery = (config: QueryConfig): TableQueryParams => {
  const pageSize = config.pagination.pageSize;
  const activeSort = config.sorting[0];

  const columnFilters = buildFiltersQuery(config.columnFilters);
  const hiddenFilters = buildFiltersQuery(config.hiddenFilters || []);

  return {
    ...hiddenFilters,
    ...columnFilters,
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
  })}`;
