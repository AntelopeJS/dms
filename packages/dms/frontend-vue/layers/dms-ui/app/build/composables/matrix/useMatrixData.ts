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
import type { MatrixWrittenValue } from "./matrixSaveEngine";
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
  /**
   * Puts what a save answered on screen: its rows in place, and its counts,
   * targets, columns, groups and footer over the read's until the next read.
   */
  applySaveResponse: (response: MatrixSaveResponse) => void;
  /** Shows values the server now holds (a conflict's, a write no row returned). */
  patchValues: (values: MatrixWrittenValue[]) => void;
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

function withValues(
  rows: MatrixRow[],
  values: MatrixWrittenValue[],
): MatrixRow[] {
  if (!values.length) return rows;
  const byRow = new Map<string, MatrixWrittenValue[]>();
  for (const value of values) {
    byRow.set(value.rowId, [...(byRow.get(value.rowId) ?? []), value]);
  }
  return rows.map((row) => {
    const written = byRow.get(row.id);
    if (!written) return row;
    const patched = { ...row.values };
    for (const value of written) patched[value.columnId] = value.value;
    return { ...row, values: patched };
  });
}

/** What a save answered over the read: kept apart, until the next read. */
export type MatrixAnswerOverrides = Pick<
  MatrixData,
  "counts" | "targets" | "columns" | "groups" | "footer"
>;

/** The overrides after a save's answer: each part it holds replaces its own. */
export function answerOverridesOf(
  previous: MatrixAnswerOverrides,
  response: MatrixSaveResponse,
): MatrixAnswerOverrides {
  return {
    ...previous,
    ...(response.counts && {
      counts: { ...previous.counts, ...response.counts },
    }),
    ...(response.targets && { targets: response.targets }),
    ...(response.columns && { columns: response.columns }),
    ...(response.groups && { groups: response.groups }),
    ...(response.footer !== undefined && { footer: response.footer }),
  };
}

/** A read with a save's answer laid over it. */
export function withAnswerOverrides(
  data: MatrixData,
  overrides: MatrixAnswerOverrides,
): MatrixData {
  return {
    ...data,
    ...overrides,
    ...((data.counts || overrides.counts) && {
      counts: { ...data.counts, ...overrides.counts },
    }),
  };
}

/** Where a source keeps its rows: the read, and how to rewrite them. */
interface MatrixRowStore {
  read: ComputedRef<MatrixData | null>;
  writeRows: (rewrite: (rows: MatrixRow[]) => MatrixRow[]) => void;
}

/** The parts of a source that put a save's answer on screen. */
type MatrixAnswerParts = Pick<
  MatrixDataSource,
  "data" | "applySaveResponse" | "patchValues"
>;

/**
 * The data shown: the read with the last save's answer over it. Rows are
 * rewritten where the read keeps them (a page among the infinite pages); the
 * rest of an answer is kept apart, so a later page read cannot drop it, and
 * goes with the next read of the query.
 */
function useAnswerOverrides(store: MatrixRowStore): MatrixAnswerParts {
  const overrides = shallowRef<MatrixAnswerOverrides>({});
  let isWriting = false;
  watch(
    store.read,
    () => {
      if (!isWriting) overrides.value = {};
    },
    { flush: "sync" },
  );
  const writeRows = (rewrite: (rows: MatrixRow[]) => MatrixRow[]) => {
    isWriting = true;
    try {
      store.writeRows(rewrite);
    } finally {
      isWriting = false;
    }
  };
  return {
    data: computed(() =>
      store.read.value
        ? withAnswerOverrides(store.read.value, overrides.value)
        : null,
    ),
    applySaveResponse: (response) => {
      overrides.value = answerOverridesOf(overrides.value, response);
      if (response.rows?.length)
        writeRows((rows) => replaceRows(rows, response.rows ?? []));
    },
    patchValues: (values) => writeRows((rows) => withValues(rows, values)),
  };
}

/** The rows of a data ref, rewritten in place. */
function refRowStore(data: Ref<MatrixData | null>): MatrixRowStore {
  return {
    read: computed(() => data.value),
    writeRows: (rewrite) => {
      if (data.value)
        data.value = { ...data.value, rows: rewrite(data.value.rows) };
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
    isLoading: computed(() => loaded.status.value === "pending"),
    error: loaded.error,
    hasMore: computed(() => false),
    isLoadingMore: computed(() => false),
    refresh,
    loadMore: async () => {},
    ...useAnswerOverrides(refRowStore(loaded.data)),
  };
}

const KEY_PREFIX = "dms-matrix";

/** The rows read so far, from the first page on; the rest from the last page read. */
export function mergePages(pages: MatrixData[]): MatrixData | null {
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
  // Rows are rewritten in the page that holds them.
  const store: MatrixRowStore = {
    read: computed(() => mergePages(paged.pages.value)),
    writeRows: (rewrite) => {
      const value = paged.data.value;
      if (!value) return;
      paged.data.value = {
        ...value,
        pages: value.pages.map((page) => ({
          ...page,
          rows: rewrite(page.rows),
        })),
      };
    },
  };
  return {
    isLoading: computed(
      () => paged.status.value === "pending" && !paged.loadingMore.value,
    ),
    error: paged.error,
    hasMore: computed(() => paged.hasMore.value),
    isLoadingMore: computed(() => paged.loadingMore.value),
    refresh,
    loadMore: () => paged.loadMore(),
    ...useAnswerOverrides(store),
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
  const store: MatrixRowStore = {
    read: computed<MatrixData | null>(() => {
      const value = queried.value;
      if (!value || pagination !== "infinite") return value;
      return { ...value, rows: value.rows.slice(0, revealed.value) };
    }),
    // The static rows themselves: the query reads them again as they change.
    writeRows: refRowStore(local).writeRows,
  };
  return {
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
    ...useAnswerOverrides(store),
  };
}
