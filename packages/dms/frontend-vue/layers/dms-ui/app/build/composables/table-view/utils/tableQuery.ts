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
const EMPTY_MODE = "is_empty";
const NOT_EMPTY_MODE = "is_not_empty";
const INCLUDE_MODE = "include";
const EXCLUDE_MODE = "exclude";

/**
 * Set on a list query whose filters cannot all hold (a tab and a view each
 * pinning a column to another value): it lists no rows, so nothing is
 * requested — the rows, the counters, the footer and the exports all read
 * empty. A display fetching its own rows from `context.query` checks it.
 */
export const NO_ROWS_QUERY_KEY = "noRows";

/** Whether `query` was built from filters that keep no row. */
export const isNoRowsQuery = (query: object): boolean =>
  (query as Record<string, unknown>)[NO_ROWS_QUERY_KEY] === true;

/** A sent filter, `<mode>:<value>`, read back. */
interface SentFilter {
  mode: string;
  value: string;
}

const readFilter = (sent: string): SentFilter => {
  const separator = sent.indexOf(":");
  return { mode: sent.slice(0, separator), value: sent.slice(separator + 1) };
};

/** The values of an `include` or `exclude` filter, sent comma-joined. */
const listValues = (filter: SentFilter): string[] => filter.value.split(",");

/** The value modes a single `is:<value>` filter holds under, by their mode. */
const VALUE_HOLDS: Record<
  string,
  (value: string, other: SentFilter) => boolean
> = {
  [VALUE_MODE]: (value, other) => other.value === value,
  [NOT_VALUE_MODE]: (value, other) => other.value !== value,
  [NOT_EMPTY_MODE]: () => true,
  [EMPTY_MODE]: () => false,
  [INCLUDE_MODE]: (value, other) => listValues(other).includes(value),
  [EXCLUDE_MODE]: (value, other) => !listValues(other).includes(value),
};

/**
 * Whether the `column` filter keeps only rows the `hidden` filter keeps too:
 * an equal filter, or one value the hidden filter accepts.
 */
const isNarrowerFilter = (column: SentFilter, hidden: SentFilter): boolean => {
  if (column.mode === hidden.mode && column.value === hidden.value) return true;
  if (column.mode !== VALUE_MODE) return false;
  return VALUE_HOLDS[hidden.mode]?.(column.value, hidden) ?? false;
};

/**
 * Whether no row can pass both filters of one column: one value the other
 * rejects, an empty value and a required one, or two value lists with none
 * in common. Combinations it cannot tell are not disjoint.
 */
const areDisjointFilters = (a: SentFilter, b: SentFilter): boolean => {
  const [one, other] = a.mode === VALUE_MODE ? [a, b] : [b, a];
  if (one.mode === VALUE_MODE) {
    const holds = VALUE_HOLDS[other.mode];
    return !!holds && !holds(one.value, other);
  }
  const modes = new Set([a.mode, b.mode]);
  if (modes.has(EMPTY_MODE)) {
    return modes.has(NOT_EMPTY_MODE) || modes.has(INCLUDE_MODE);
  }
  if (a.mode === INCLUDE_MODE && b.mode === INCLUDE_MODE) {
    const values = new Set(listValues(a));
    return !listValues(b).some((value) => values.has(value));
  }
  return false;
};

/**
 * The column filters (the filters row, a saved view) laid over the hidden
 * ones (a tab, a route or query parameter), combined (AND). The list query
 * carries one filter per column, so on a column both filter, the column
 * filter is sent when it implies the hidden one, the query lists no rows
 * when they cannot both hold ({@link NO_ROWS_QUERY_KEY}), and the hidden
 * filter is sent otherwise: a scope the page sets is never widened by a
 * filter the user picks — a tab stays what it says.
 */
const combineFilters = (
  hidden: Record<string, string>,
  column: Record<string, string>,
): Record<string, string | boolean> => {
  const combined: Record<string, string | boolean> = { ...hidden };
  for (const [key, value] of Object.entries(column)) {
    if (!(key in hidden)) {
      combined[key] = value;
      continue;
    }
    const columnFilter = readFilter(value);
    const hiddenFilter = readFilter(hidden[key]!);
    if (isNarrowerFilter(columnFilter, hiddenFilter)) {
      combined[key] = value;
    } else if (areDisjointFilters(columnFilter, hiddenFilter)) {
      combined[NO_ROWS_QUERY_KEY] = true;
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
