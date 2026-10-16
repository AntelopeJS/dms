import { computed, type ComputedRef } from "vue";
import type { TableViewListResponse } from "../../../composables/table-view/types";
import type { useTableRows } from "./useTableRows";
import { buildTableDataKey } from "./utils/tableQuery";

type Query = Record<string, unknown>;
type TableRows<T extends Record<string, unknown>> = ReturnType<
  typeof useTableRows<T>
>;

/** What the list and the tab counters of a table view are read for. */
export interface TableListDataOptions<T extends Record<string, unknown>> {
  componentId: string | undefined;
  pageId: string | undefined;
  rows: TableRows<T>;
  query: ComputedRef<object>;
  archiveQuery: ComputedRef<Query>;
  /** A self-managed display (the kanban) reads its own rows. */
  isSelfManaged: ComputedRef<boolean>;
  /**
   * Added to each request when it leaves, never watched: the live hold's
   * bound must not list the rows again by changing (see useTableLiveHold).
   */
  heldQuery?: () => Query;
}

/** One counter: its id and its list query, as the table view builds it. */
export interface TableCountRequest {
  id: string;
  query: object;
}

export interface TableCountsDataOptions<T extends Record<string, unknown>> {
  componentId: string | undefined;
  pageId: string | undefined;
  rows: TableRows<T>;
  queries: ComputedRef<TableCountRequest[]>;
  archiveQuery: ComputedRef<Query>;
  /** Added to each request when it leaves, never watched (see the list's). */
  heldQuery?: () => Query;
}

const NO_HELD_QUERY = (): Query => ({});

/**
 * A watch source following `source` by value: a query rebuilt equal (its
 * inputs recomputed to the same values, a period re-resolved to the same
 * bounds) must not read the rows again.
 */
const byValue = (source: ComputedRef<unknown>): ComputedRef<string> =>
  computed(() => JSON.stringify(source.value));

const EMPTY_LIST_RESULT: TableViewListResponse<never> = {
  results: [],
  total: 0,
  offset: 0,
  limit: 0,
};

/**
 * The page of rows a table view shows: awaited by a server render, which
 * transfers it, but not by a client navigation, which paints the list chrome
 * and its skeleton at once (`lazy`). Read the loading state from `data`
 * (`null` until the first result). The key names the source URL: a
 * navigation that remounts the page while the previous one is still on screen
 * binds to the cached entry of its key, so another URL needs another key to be
 * requested at all, and the watch covers a page kept mounted.
 */
export function useTableListData<T extends Record<string, unknown>>(
  options: TableListDataOptions<T>,
) {
  const { rows, query, archiveQuery, isSelfManaged } = options;
  const heldQuery = options.heldQuery ?? NO_HELD_QUERY;
  const key = buildTableDataKey({
    componentId: options.componentId,
    pageId: options.pageId,
    query: query.value,
    archiveQuery: archiveQuery.value,
    isSelfManaged: isSelfManaged.value,
    sourceUrl: rows.sourceUrl.value,
  });
  return useDmsAsyncData(
    key,
    // `null` while a source waits on its period scope: the table's skeleton.
    ({ signal }): Promise<TableViewListResponse<T> | null> =>
      isSelfManaged.value
        ? Promise.resolve(EMPTY_LIST_RESULT)
        : rows.list(
            { ...query.value, ...archiveQuery.value, ...heldQuery() },
            signal,
          ),
    {
      watch: [
        byValue(query),
        byValue(archiveQuery),
        isSelfManaged,
        rows.sourceUrl,
      ],
      lazy: true,
      // The table reads again on its own triggers, through its live hold.
      refreshOnPageRefresh: false,
    },
  );
}

/**
 * The counters of a table view's tabs and views, keyed by id; `null` until
 * they arrive. Keyed by source URL like the list (see useTableListData).
 *
 * A source waiting on its period scope answers `null` too, like its list: a
 * server render that cannot resolve the period as the browser will (see
 * `usePeriodScope`) draws the counters' skeleton, as the browser does until
 * its own request answers, and hydration matches.
 */
export function useTableCountsData<T extends Record<string, unknown>>(
  options: TableCountsDataOptions<T>,
) {
  const { rows, queries, archiveQuery } = options;
  const heldQuery = options.heldQuery ?? NO_HELD_QUERY;
  const sourceSuffix = rows.sourceUrl.value ? `-${rows.sourceUrl.value}` : "";
  return useDmsAsyncData<Record<string, number> | null>(
    `table-view-${options.componentId}-${options.pageId}-tab-counts${sourceSuffix}`,
    async ({ signal }) => {
      if (rows.isPeriodPending.value) return null;
      if (queries.value.length === 0) return {};
      return await rows.countBatch(
        queries.value.map(({ id, query }) => ({
          id,
          query: { ...query, ...archiveQuery.value, ...heldQuery() },
        })),
        signal,
      );
    },
    {
      watch: [byValue(queries), byValue(archiveQuery), rows.sourceUrl],
      lazy: true,
      refreshOnPageRefresh: false,
    },
  );
}
