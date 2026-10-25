import {
  facetParam,
  type MatrixQueryState,
  type MatrixSortDirection,
} from "./matrixQuery";

/**
 * The grid's state in the page URL. Every key is prefixed with the block's
 * component id (`stock.page=3`, `stock.facet_store=ENT,WEB`): two grids on a
 * page never read each other's keys, and none collides with the page's own
 * query (`{{query.X}}` of a `fetchUrl`). A value at its default is left out.
 * The page is written from 1, as a person reads it.
 */
const URL_KEYS = {
  page: "page",
  pageSize: "size",
  search: "search",
  status: "status",
  sort: "sort",
  direction: "dir",
} as const;

const FACET_SEPARATOR = ",";
const SORT_DIRECTIONS: ReadonlySet<string> = new Set(["asc", "desc"]);

/** The URL key of `key` for the grid `componentId`. */
export function matrixUrlKey(componentId: string, key: string): string {
  return `${componentId}.${key}`;
}

type QueryValue = string | null | undefined | Array<string | null>;

function firstValue(value: QueryValue): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single ?? undefined;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The state the URL gives the grid, over `defaults`. `facetIds` are the
 * facets the grid offers: only their keys are read.
 */
export function readMatrixUrlState(
  query: Record<string, QueryValue>,
  componentId: string,
  defaults: MatrixQueryState,
  facetIds: string[],
): MatrixQueryState {
  const read = (key: string) =>
    firstValue(query[matrixUrlKey(componentId, key)]);
  const page = readPositiveInteger(read(URL_KEYS.page));
  const pageSize = readPositiveInteger(read(URL_KEYS.pageSize));
  const sortColumn = read(URL_KEYS.sort);
  const direction = read(URL_KEYS.direction) ?? "asc";
  const facets: Record<string, string[]> = { ...defaults.facets };
  for (const id of facetIds) {
    const value = read(facetParam(id));
    if (value) facets[id] = value.split(FACET_SEPARATOR).filter(Boolean);
  }
  return {
    page: page ? page - 1 : defaults.page,
    pageSize: pageSize ?? defaults.pageSize,
    search: read(URL_KEYS.search) ?? defaults.search,
    status: read(URL_KEYS.status) ?? defaults.status,
    facets,
    sort:
      sortColumn && SORT_DIRECTIONS.has(direction)
        ? {
            columnId: sortColumn,
            direction: direction as MatrixSortDirection,
          }
        : defaults.sort,
  };
}

/**
 * The URL keys of the state, each with its value or `undefined` to remove
 * it (at its default). Facets the grid offers are always listed, so one
 * cleared leaves the URL.
 */
export function matrixUrlEntries(
  componentId: string,
  state: MatrixQueryState,
  defaults: MatrixQueryState,
  facetIds: string[],
): Record<string, string | undefined> {
  const key = (name: string) => matrixUrlKey(componentId, name);
  const unlessDefault = <T>(value: T, fallback: T, text: string) =>
    value === fallback ? undefined : text;
  const entries: Record<string, string | undefined> = {
    [key(URL_KEYS.page)]: unlessDefault(
      state.page,
      defaults.page,
      String(state.page + 1),
    ),
    [key(URL_KEYS.pageSize)]: unlessDefault(
      state.pageSize,
      defaults.pageSize,
      String(state.pageSize),
    ),
    [key(URL_KEYS.search)]: state.search.trim() || undefined,
    [key(URL_KEYS.status)]: unlessDefault(
      state.status,
      defaults.status,
      state.status,
    ),
    [key(URL_KEYS.sort)]: state.sort?.columnId,
    [key(URL_KEYS.direction)]: state.sort?.direction,
  };
  for (const id of facetIds) {
    const values = state.facets[id] ?? [];
    entries[key(facetParam(id))] = values.length
      ? values.join(FACET_SEPARATOR)
      : undefined;
  }
  return entries;
}

/**
 * Writes the entries in the browser's URL in place: no visit and no history
 * entry, as a table view keeps its tab. Nothing on a server render.
 */
export function writeMatrixUrlEntries(
  entries: Record<string, string | undefined>,
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
}
