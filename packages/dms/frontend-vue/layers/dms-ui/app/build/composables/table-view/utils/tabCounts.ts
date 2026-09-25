/**
 * How the filter tabs fetch their counters, mirroring `TableViewTabCountMode`
 * in the interface package. A table served by an older backend sends none and
 * keeps the batch route it always used.
 */
export type TabCountMode = "batch" | "single" | "none";

/** One tab's counter request: the list query narrowed to that tab. */
export interface TabCountQuery {
  id: string;
  query: Record<string, unknown>;
}

interface TabCountFetchOptions {
  method?: "POST";
  query?: Record<string, unknown>;
  body?: unknown;
}

/** The `$authFetch` subset the counters need. */
export type TabCountFetcher = <R>(
  url: string,
  options: TabCountFetchOptions,
) => Promise<R>;

interface SingleCountResponse {
  total: number;
}

const DEFAULT_TAB_COUNT_MODE: TabCountMode = "batch";

function fetchBatchCounts(
  location: string,
  queries: TabCountQuery[],
  fetcher: TabCountFetcher,
): Promise<Record<string, number>> {
  return fetcher<Record<string, number>>(`${location}/count/batch`, {
    method: "POST",
    body: { queries },
  });
}

// A tab whose count fails is left without one rather than failing the others.
async function fetchSingleCounts(
  location: string,
  queries: TabCountQuery[],
  fetcher: TabCountFetcher,
): Promise<Record<string, number>> {
  const results = await Promise.allSettled(
    queries.map(({ query }) =>
      fetcher<SingleCountResponse>(`${location}/count`, { query }),
    ),
  );
  return Object.fromEntries(
    results.flatMap((result, index) =>
      result.status === "fulfilled"
        ? [[queries[index]!.id, result.value.total]]
        : [],
    ),
  );
}

const TAB_COUNT_FETCHERS: Record<
  TabCountMode,
  (
    location: string,
    queries: TabCountQuery[],
    fetcher: TabCountFetcher,
  ) => Promise<Record<string, number>>
> = {
  batch: fetchBatchCounts,
  single: fetchSingleCounts,
  none: async () => ({}),
};

/** Counters of every tab, keyed by tab id, through the route the table has. */
export function fetchTabCounts(
  mode: TabCountMode | undefined,
  location: string,
  queries: TabCountQuery[],
  fetcher: TabCountFetcher,
): Promise<Record<string, number>> {
  if (queries.length === 0) return Promise.resolve({});
  return TAB_COUNT_FETCHERS[mode ?? DEFAULT_TAB_COUNT_MODE](
    location,
    queries,
    fetcher,
  );
}
