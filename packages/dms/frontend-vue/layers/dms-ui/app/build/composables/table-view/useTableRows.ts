import { get } from "@nuxt/ui/runtime/utils/index.js";
import type {
  TableViewColumn,
  TableViewListResponse,
  TableViewSourceConfig,
} from "../../../composables/table-view/types";

type Query = Record<string, unknown>;

/** One count of a batch: its id and its list query. */
export interface TableCountQuery {
  id: string;
  query: Query;
}

export interface TableRowsOptions {
  api: ReturnType<typeof $fetch.create>;
  /** Data API location of the controller (`<location>/list`…). */
  location: string;
  /** A `TableView.fromSource` table's route, instead of a controller. */
  source?: TableViewSourceConfig;
  columns: TableViewColumn[];
}

const FILTER_PREFIX = "filter_";
const SEARCH_KEY = "search";
const SORT_KEYS = ["sortKey", "sortDirection"];
const PAGE_KEYS = ["offset", "limit"];
const DESCENDING = "desc";

type SourceCapabilities = TableViewSourceConfig["capabilities"];

// Which capability lets a query key reach the route.
const QUERY_KEY_CAPABILITIES: Array<
  [matches: (key: string) => boolean, capability: keyof SourceCapabilities]
> = [
  [(key) => key.startsWith(FILTER_PREFIX), "filter"],
  [(key) => key === SEARCH_KEY, "search"],
  [(key) => SORT_KEYS.includes(key), "sort"],
  [(key) => PAGE_KEYS.includes(key), "paginate"],
];

/** The part of the list query a source route handles, by its capabilities. */
export function sourceRouteQuery(
  query: Query,
  capabilities: SourceCapabilities,
): Query {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => {
      const entry = QUERY_KEY_CAPABILITIES.find(([matches]) => matches(key));
      return !entry || !!capabilities[entry[1]];
    }),
  );
}

const textOf = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return textOf(a).localeCompare(textOf(b), undefined, { numeric: true });
};

/**
 * The rows the browser narrows, sorts and pages itself, for what the source
 * route left to it: a search over the listed columns' text, the sort on one
 * column, the page.
 */
export function processSourceRows<T extends Record<string, unknown>>(
  rows: T[],
  query: Query,
  capabilities: SourceCapabilities,
  columns: TableViewColumn[],
): TableViewListResponse<T> {
  let processed = rows;
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (!capabilities.search && search) {
    const needle = search.toLocaleLowerCase();
    const keys = columns.map((column) => column.accessorKey);
    processed = processed.filter((row) =>
      keys.some((key) =>
        textOf(get(row, key)).toLocaleLowerCase().includes(needle),
      ),
    );
  }
  const sortKey = typeof query.sortKey === "string" ? query.sortKey : "";
  if (!capabilities.sort && sortKey) {
    const direction = query.sortDirection === DESCENDING ? -1 : 1;
    processed = [...processed].sort(
      (a, b) => direction * compareValues(get(a, sortKey), get(b, sortKey)),
    );
  }
  const offset = Number(query.offset) || 0;
  const limit = Number(query.limit) || processed.length;
  return {
    results: processed.slice(offset, offset + limit),
    total: processed.length,
    offset,
    limit,
  };
}

/**
 * Where a table view reads its rows: its data controller's routes, or the
 * route of a `TableView.fromSource` table — which answers `{ results, total }`
 * for the part of the query it handles. A route answering every row leaves
 * the rest to the browser; a route answering one page is taken as it is.
 */
export function useTableRows<T extends Record<string, unknown>>(
  options: TableRowsOptions,
) {
  const { api, location, source, columns } = options;

  const listFromSource = async (
    sourceConfig: TableViewSourceConfig,
    query: Query,
  ): Promise<TableViewListResponse<T>> => {
    const { capabilities } = sourceConfig;
    const response = await api<{ results: T[]; total: number }>(
      sourceConfig.fetchUrl,
      { query: sourceRouteQuery(query, capabilities) },
    );
    if (capabilities.paginate) {
      return {
        ...response,
        offset: Number(query.offset) || 0,
        limit: Number(query.limit) || 0,
      };
    }
    return processSourceRows(response.results, query, capabilities, columns);
  };

  const list = (query: Query): Promise<TableViewListResponse<T>> =>
    source
      ? listFromSource(source, query)
      : api<TableViewListResponse<T>>(`${location}/list`, { query });

  // A source answers its totals one list at a time.
  const countBatch = async (
    queries: TableCountQuery[],
  ): Promise<Record<string, number>> => {
    if (!source) {
      return api<Record<string, number>>(`${location}/count/batch`, {
        method: "POST",
        body: { queries },
      });
    }
    const totals = await Promise.all(
      queries.map(async ({ id, query }) => {
        const { total } = await listFromSource(source, {
          ...query,
          offset: 0,
          limit: 1,
        });
        return [id, total] as const;
      }),
    );
    return Object.fromEntries(totals);
  };

  /** One row by id: a source has no route for it. */
  const getRow = (id: string): Promise<T | undefined> =>
    source
      ? Promise.resolve(undefined)
      : api<T>(`${location}/get`, { query: { id } });

  return { isSource: !!source, list, countBatch, getRow };
}
