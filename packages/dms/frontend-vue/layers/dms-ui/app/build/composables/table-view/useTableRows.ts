import { get } from "@nuxt/ui/runtime/utils/index.js";
import { computed } from "vue";
import { interpolateUrl } from "#dms-core/app/utils/url-interpolation";
import type {
  TableViewColumn,
  TableViewListResponse,
  TableViewSourceConfig,
} from "../../../composables/table-view/types";
import {
  type ReplaceUrlVariablesContext,
  resolveUrlVariables,
} from "../../utils/urlVariables";
import type { RowActionRule } from "#dms-core/app/types/row-action";
import { pinRows } from "./utils/pinnedRows";
import {
  appendPeriodToUrl,
  usePeriodScope,
} from "#dms-core/app/composables/period/usePeriodScope";

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
  /**
   * The page route a source's `fetchUrl` names: its parameters and query,
   * read again on every request.
   */
  route?: () => ReplaceUrlVariablesContext;
  /**
   * The rows listed first whatever the sort (backend `pinnedRows`), read on
   * every request: `undefined` while the display pins nothing.
   */
  pinnedRows?: () => RowActionRule | undefined;
}

const FILTER_PREFIX = "filter_";
const SEARCH_KEY = "search";
const SORT_KEYS = ["sortKey", "sortDirection"];
const PAGE_KEYS = ["offset", "limit"];
const DESCENDING = "desc";
/**
 * Sent while a `liveHold` table is paused: the moment its rows were frozen,
 * for a source route to list the rows as they stood then.
 */
export const LIVE_HELD_AT_QUERY_KEY = "liveHeldAt";
const NO_ROUTE_VALUES: ReplaceUrlVariablesContext = { routeQuery: {} };

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

/**
 * The part of the list query a source route handles, by its capabilities: a
 * key no capability names (a controller's `showArchived`…) never reaches it.
 * The live hold's bound always does: a route not reading it lists as usual.
 */
export function sourceRouteQuery(
  query: Query,
  capabilities: SourceCapabilities,
): Query {
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => {
      if (key === LIVE_HELD_AT_QUERY_KEY) return true;
      const entry = QUERY_KEY_CAPABILITIES.find(([matches]) => matches(key));
      return !!entry && !!capabilities[entry[1]];
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
 * column, the page. The pinned rows lead before the page is cut, so they
 * open the first one.
 */
export function processSourceRows<T extends Record<string, unknown>>(
  rows: T[],
  query: Query,
  capabilities: SourceCapabilities,
  columns: TableViewColumn[],
  pinnedRows?: RowActionRule,
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
  processed = pinRows(processed, pinnedRows);
  const offset = Number(query.offset) || 0;
  const limit = Number(query.limit) || processed.length;
  return {
    results: processed.slice(offset, offset + limit),
    total: processed.length,
    offset,
    limit,
  };
}

type SourceAnswer<T> = { results: T[]; total: number };

/** A source read some callers wait on, and what cancels it. */
interface SharedRead<T> {
  answer: Promise<SourceAnswer<T>>;
  controller: AbortController;
  /** The callers still waiting on it. */
  waiting: number;
}

/**
 * The key of one read of a source: its URL and the query sent, whatever the
 * order its keys were built in.
 */
const sourceReadKey = (url: string, query: Query): string =>
  JSON.stringify([url, Object.entries(query).sort(([a], [b]) => a.localeCompare(b))]);

/**
 * Settles with `answer`, or rejects as soon as `signal` aborts, calling
 * `leave` once then.
 */
function awaitUnlessAborted<R>(
  answer: Promise<R>,
  signal: AbortSignal,
  leave: () => void,
): Promise<R> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      leave();
      reject(signal.reason);
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    answer.then(resolve, reject).finally(() =>
      signal.removeEventListener("abort", abort),
    );
  });
}

/** A page with no rows: what a source shows while its URL is unresolved. */
function emptySourcePage<T>(query: Query): TableViewListResponse<T> {
  return {
    results: [],
    total: 0,
    offset: Number(query.offset) || 0,
    limit: Number(query.limit) || 0,
  };
}

/**
 * Where a table view reads its rows: its data controller's routes, or the
 * route of a `TableView.fromSource` table — which answers `{ results, total }`
 * for the part of the query it handles. A route answering every row leaves
 * the rest to the browser; a route answering one page is taken as it is.
 *
 * A source's `{{params.X}}` and `{{query.X}}` tokens are filled from `route`;
 * while one has no value nothing is requested and the list is empty. A
 * source's `periodScope` adds the period of its selector to the URL, like a
 * chart's; until that selector registers, nothing is requested and the list
 * answers `null`, which the table draws as its skeleton. `sourceUrl` is the
 * URL requested, for the caller to list again when it changes. The rows
 * `pinnedRows` accepts lead each list answered.
 */
export function useTableRows<T extends Record<string, unknown>>(
  options: TableRowsOptions,
) {
  const { api, location, source, columns } = options;
  const periodScope = usePeriodScope(source?.periodScope);
  const isPeriodPending = computed(
    () => !!source?.periodScope && !periodScope.value,
  );

  const sourceUrl = computed(() => {
    if (!source) return undefined;
    const url = resolveUrlVariables(
      source.fetchUrl,
      options.route?.() ?? NO_ROUTE_VALUES,
    );
    return source.periodScope ? appendPeriodToUrl(url, periodScope.value) : url;
  });

  // Reads of the same source with the same query, while one is in flight,
  // share it: the list and the counter of a tab that filters nothing the
  // route handles ask it the same thing at the same time. The request is
  // cancelled once every caller waiting on it has given up.
  const sharedReads = new Map<string, SharedRead<T>>();
  const readSource = (
    url: string,
    query: Query,
    signal?: AbortSignal,
  ): Promise<SourceAnswer<T>> => {
    const key = sourceReadKey(url, query);
    let read = sharedReads.get(key);
    if (!read) {
      const controller = new AbortController();
      const answer = api<SourceAnswer<T>>(url, {
        query,
        signal: controller.signal,
      });
      const started: SharedRead<T> = { answer, controller, waiting: 0 };
      sharedReads.set(key, started);
      const forget = () => {
        if (sharedReads.get(key) === started) sharedReads.delete(key);
      };
      answer.then(forget, forget);
      read = started;
    }
    const joined = read;
    // A caller without a signal never gives up: the request stays.
    joined.waiting += 1;
    if (!signal) return joined.answer;
    return awaitUnlessAborted(joined.answer, signal, () => {
      joined.waiting -= 1;
      if (joined.waiting > 0) return;
      if (sharedReads.get(key) === joined) sharedReads.delete(key);
      joined.controller.abort(signal.reason);
    });
  };

  const listFromSource = async (
    sourceConfig: TableViewSourceConfig,
    query: Query,
    signal?: AbortSignal,
  ): Promise<TableViewListResponse<T> | null> => {
    if (isPeriodPending.value) return null;
    const url = sourceUrl.value;
    if (!url) return emptySourcePage(query);
    const { capabilities } = sourceConfig;
    const response = await readSource(
      url,
      sourceRouteQuery(query, capabilities),
      signal,
    );
    if (capabilities.paginate) {
      return {
        ...response,
        offset: Number(query.offset) || 0,
        limit: Number(query.limit) || 0,
      };
    }
    return processSourceRows(
      response.results,
      query,
      capabilities,
      columns,
      options.pinnedRows?.(),
    );
  };

  const withPinnedRows = (
    page: TableViewListResponse<T> | null,
  ): TableViewListResponse<T> | null =>
    page && { ...page, results: pinRows(page.results, options.pinnedRows?.()) };

  // `signal` aborts the request once its answer is no longer wanted.
  const list = async (
    query: Query,
    signal?: AbortSignal,
  ): Promise<TableViewListResponse<T> | null> =>
    withPinnedRows(
      source
        ? await listFromSource(source, query, signal)
        : await api<TableViewListResponse<T>>(`${location}/list`, {
            query,
            signal,
          }),
    );

  // A source answers its totals one list at a time.
  const countBatch = async (
    queries: TableCountQuery[],
    signal?: AbortSignal,
  ): Promise<Record<string, number>> => {
    if (!source) {
      return api<Record<string, number>>(`${location}/count/batch`, {
        method: "POST",
        body: { queries },
        signal,
      });
    }
    const totals = await Promise.all(
      queries.map(async ({ id, query }) => {
        const page = await listFromSource(
          source,
          { ...query, offset: 0, limit: 1 },
          signal,
        );
        return page ? [[id, page.total] as const] : [];
      }),
    );
    return Object.fromEntries(totals.flat());
  };

  // A source reads one row through its `fetchRowUrl`, if it declares one. It
  // sends no list query, the period included: one row by id depends on none.
  const getSourceRow = (
    sourceConfig: TableViewSourceConfig,
    id: string,
  ): Promise<T | undefined> => {
    const url = resolveUrlVariables(
      sourceConfig.fetchRowUrl &&
        interpolateUrl(sourceConfig.fetchRowUrl, { id }),
      options.route?.() ?? NO_ROUTE_VALUES,
    );
    return url ? api<T>(url) : Promise.resolve(undefined);
  };

  /** One row by id: a source's `fetchRowUrl`, a controller's `get` route. */
  const getRow = (id: string): Promise<T | undefined> =>
    source
      ? getSourceRow(source, id)
      : api<T>(`${location}/get`, { query: { id } });

  return {
    isSource: !!source,
    sourceUrl,
    isPeriodPending,
    list,
    countBatch,
    getRow,
  };
}
