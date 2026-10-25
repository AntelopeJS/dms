import {
  computed,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  useApiData,
  useApiPagedData,
  type UseApiDataOptions,
} from "#dms-core/app/composables/auth/useApiData";
import { resolveUrlVariables } from "../../utils/urlVariables";
import { useRefreshTriggers } from "../blocks/useRefreshTriggers";
import type {
  MatrixData,
  MatrixOptions,
  MatrixRow,
  MatrixSaveResponse,
} from "../../../types/matrix";
import {
  applyStaticQuery,
  buildMatrixQuery,
  matrixFilterParams,
  type MatrixQueryState,
} from "./matrixQuery";

/** The rows a grid shows, and what changes them in place. */
export interface MatrixDataSource {
  /** The answer on screen: a page, every page read so far, or the static rows. */
  data: ComputedRef<MatrixData | null>;
  /** A read for the current query is on its way. */
  isLoading: ComputedRef<boolean>;
  error: Ref<unknown>;
  /** An infinite grid has rows past the ones read. */
  hasMore: ComputedRef<boolean>;
  isLoadingMore: ComputedRef<boolean>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Puts what a save answered on screen: its rows, counts and targets. */
  applySaveResponse: (response: MatrixSaveResponse) => void;
  /** Shows the value a conflict says is stored. */
  patchValue: (rowId: string, columnId: string, value: unknown) => void;
}

export interface MatrixDataOptions {
  options: MatrixOptions;
  query: Ref<MatrixQueryState>;
  routeParams: () => Record<string, string> | undefined;
  /** The state of the block's watch actions: a change reads again. */
  watchKey: () => string;
}

function replaceRows(rows: MatrixRow[], answered: MatrixRow[]): MatrixRow[] {
  if (!answered.length) return rows;
  const byId = new Map(answered.map((row) => [row.id, row]));
  return rows.map((row) => byId.get(row.id) ?? row);
}

function withValue(
  rows: MatrixRow[],
  rowId: string,
  columnId: string,
  value: unknown,
): MatrixRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, values: { ...row.values, [columnId]: value } }
      : row,
  );
}

/** An answer with a save's rows, counts and targets laid over it. */
export function withSaveResponse(
  data: MatrixData,
  response: MatrixSaveResponse,
): MatrixData {
  return {
    ...data,
    rows: replaceRows(data.rows, response.rows ?? []),
    ...(response.counts && { counts: { ...data.counts, ...response.counts } }),
    ...(response.targets && { targets: response.targets }),
  };
}

/** The data a source edits in place: a ref it can read and replace. */
type EditableData = Ref<MatrixData | null>;

function editors(
  data: EditableData,
): Pick<MatrixDataSource, "applySaveResponse" | "patchValue"> {
  return {
    applySaveResponse: (response) => {
      if (data.value) data.value = withSaveResponse(data.value, response);
    },
    patchValue: (rowId, columnId, value) => {
      if (!data.value) return;
      data.value = {
        ...data.value,
        rows: withValue(data.value.rows, rowId, columnId, value),
      };
    },
  };
}

function useResolvedUrl(
  url: string | undefined,
  routeParams: () => Record<string, string> | undefined,
): ComputedRef<string | undefined> {
  const route = useDmsRoute();
  return computed(() =>
    resolveUrlVariables(url, {
      routeParams: routeParams(),
      routeQuery: route.query as Record<string, unknown>,
    }),
  );
}

/**
 * The rows of a Matrix block: `staticData`, read in the browser under the
 * grid's search, sort and page; or `fetchUrl`, read with the query (one page,
 * every row, or page after page for an infinite grid), again on each event of
 * `realtimeTopic` and on the page's refreshes. A page being read keeps the
 * previous one on screen.
 */
export function useMatrixData(source: MatrixDataOptions): MatrixDataSource {
  if (!source.options.fetchUrl) return useStaticMatrixData(source);
  if (source.options.pagination === "infinite")
    return useInfiniteMatrixData(source);
  return usePagedMatrixData(source);
}

function usePagedMatrixData(source: MatrixDataOptions): MatrixDataSource {
  const { options, query } = source;
  const url = useResolvedUrl(options.fetchUrl, source.routeParams);
  const pagination = options.pagination ?? "none";
  const loaded = useApiData<MatrixData>(() => url.value ?? null, {
    method: options.fetchUrlMethod as UseApiDataOptions<MatrixData>["method"],
    query: () => buildMatrixQuery(query.value, pagination),
    lazy: true,
    // Read again on its own triggers (realtime, page refresh) instead.
    refreshOnPageRefresh: false,
    watch: [source.watchKey],
  });
  const refresh = () => loaded.refresh();
  useRefreshTriggers(options.realtimeTopic, refresh);
  return {
    data: computed(() => loaded.data.value),
    isLoading: computed(() => loaded.status.value === "pending"),
    error: loaded.error,
    hasMore: computed(() => false),
    isLoadingMore: computed(() => false),
    refresh,
    loadMore: async () => {},
    ...editors(loaded.data),
  };
}

const KEY_PREFIX = "dms-matrix";

/** The rows read so far, from the first page on. */
function mergePages(pages: MatrixData[]): MatrixData | null {
  const [first] = pages;
  if (!first) return null;
  const last = pages.at(-1) ?? first;
  return {
    ...first,
    rows: pages.flatMap((page) => page.rows),
    counts: last.counts ?? first.counts,
    targets: last.targets ?? first.targets,
  };
}

function loadedCount(pages: MatrixData[]): number {
  return pages.reduce((count, page) => count + page.rows.length, 0);
}

function useInfiniteMatrixData(source: MatrixDataOptions): MatrixDataSource {
  const { options, query } = source;
  const url = useResolvedUrl(options.fetchUrl, source.routeParams);
  // Whatever filters the rows names the list: a new one reads from the start.
  const key = computed(() => {
    if (!url.value) return null;
    const params = new URLSearchParams(matrixFilterParams(query.value));
    params.set("limit", String(query.value.pageSize));
    return `${KEY_PREFIX}:${url.value}?${params}:${source.watchKey()}`;
  });
  const paged = useApiPagedData<MatrixData, number>(
    key,
    ({ $authFetch, cursor, signal }) =>
      $authFetch<MatrixData>(url.value ?? "", {
        method: options.fetchUrlMethod as "GET",
        query: buildMatrixQuery(query.value, "infinite", cursor ?? 0),
        signal,
      }),
    {
      nextCursor: (page, pages) => {
        const count = loadedCount(pages);
        const total = page.total ?? pages[0]?.total;
        if (total !== undefined) return count < total ? count : null;
        return page.rows.length < query.value.pageSize ? null : count;
      },
      lazy: true,
      refreshOnPageRefresh: false,
    },
  );
  const refresh = () => paged.refresh();
  useRefreshTriggers(options.realtimeTopic, refresh);
  const data = computed(() => mergePages(paged.pages.value));
  // Edits go into the page that holds the row.
  const editable = computed<MatrixData | null>({
    get: () => data.value,
    set: (next) => {
      const value = paged.data.value;
      if (!next || !value) return;
      const byId = new Map(next.rows.map((row) => [row.id, row]));
      paged.data.value = {
        ...value,
        pages: value.pages.map((page, index) => ({
          ...page,
          ...(index === 0 && { counts: next.counts, targets: next.targets }),
          rows: page.rows.map((row) => byId.get(row.id) ?? row),
        })),
      };
    },
  });
  return {
    data,
    isLoading: computed(
      () => paged.status.value === "pending" && !paged.loadingMore.value,
    ),
    error: paged.error,
    hasMore: computed(() => paged.hasMore.value),
    isLoadingMore: computed(() => paged.loadingMore.value),
    refresh,
    loadMore: () => paged.loadMore(),
    ...editors(editable),
  };
}

function useStaticMatrixData(source: MatrixDataOptions): MatrixDataSource {
  const { options, query } = source;
  const local = shallowRef<MatrixData | null>(options.staticData ?? null);
  watch(
    () => options.staticData,
    (next) => {
      local.value = next ?? null;
    },
  );
  const pagination = options.pagination ?? "none";
  // An infinite grid of static rows draws them a page at a time.
  const revealed = ref(query.value.pageSize);
  watch(
    () => matrixFilterParams(query.value),
    () => {
      revealed.value = query.value.pageSize;
    },
    { deep: true },
  );
  const queried = computed(() =>
    local.value
      ? applyStaticQuery(
          local.value,
          query.value,
          pagination === "pages" ? "pages" : "none",
        )
      : null,
  );
  const data = computed<MatrixData | null>(() => {
    const value = queried.value;
    if (!value || pagination !== "infinite") return value;
    return { ...value, rows: value.rows.slice(0, revealed.value) };
  });
  return {
    data,
    isLoading: computed(() => false),
    error: ref(null),
    hasMore: computed(
      () =>
        pagination === "infinite" &&
        (queried.value?.rows.length ?? 0) > revealed.value,
    ),
    isLoadingMore: computed(() => false),
    refresh: async () => {},
    loadMore: async () => {
      revealed.value += query.value.pageSize;
    },
    ...editors(local),
  };
}
