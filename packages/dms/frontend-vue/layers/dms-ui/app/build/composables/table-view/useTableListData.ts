import type { ComputedRef } from "vue";
import type { TableViewListResponse } from "../../../composables/table-view/types";
import { useServerRenderedAsyncData } from "./useServerRenderedAsyncData";
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
}

const EMPTY_LIST_RESULT: TableViewListResponse<never> = {
  results: [],
  total: 0,
  offset: 0,
  limit: 0,
};

/**
 * The page of rows a table view shows. The key names the source URL: a
 * navigation that remounts the page while the previous one is still on screen
 * binds to the cached entry of its key, so another URL needs another key to be
 * requested at all, and the watch covers a page kept mounted.
 */
export function useTableListData<T extends Record<string, unknown>>(
  options: TableListDataOptions<T>,
) {
  const { rows, query, archiveQuery, isSelfManaged } = options;
  const key = buildTableDataKey({
    componentId: options.componentId,
    pageId: options.pageId,
    query: query.value,
    archiveQuery: archiveQuery.value,
    isSelfManaged: isSelfManaged.value,
    sourceUrl: rows.sourceUrl.value,
  });
  return useServerRenderedAsyncData(
    key,
    (): Promise<TableViewListResponse<T>> =>
      isSelfManaged.value
        ? Promise.resolve(EMPTY_LIST_RESULT)
        : rows.list({ ...query.value, ...archiveQuery.value }),
    { watch: [query, archiveQuery, isSelfManaged, rows.sourceUrl] },
  );
}

/**
 * The counters of a table view's tabs and views, keyed by id; `null` until
 * they arrive. Keyed by source URL like the list (see useTableListData).
 */
export function useTableCountsData<T extends Record<string, unknown>>(
  options: TableCountsDataOptions<T>,
) {
  const { rows, queries, archiveQuery } = options;
  const sourceSuffix = rows.sourceUrl.value ? `-${rows.sourceUrl.value}` : "";
  return useServerRenderedAsyncData<Record<string, number>>(
    `table-view-${options.componentId}-${options.pageId}-tab-counts${sourceSuffix}`,
    async () => {
      if (queries.value.length === 0) return {};
      return await rows.countBatch(
        queries.value.map(({ id, query }) => ({
          id,
          query: { ...query, ...archiveQuery.value },
        })),
      );
    },
    { watch: [queries, archiveQuery, rows.sourceUrl] },
  );
}
