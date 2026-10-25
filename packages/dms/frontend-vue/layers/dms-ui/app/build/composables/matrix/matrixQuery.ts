import type {
  MatrixData,
  MatrixPagination,
  MatrixRow,
} from "../../../types/matrix";
import { valueText } from "./matrixValues";

export type MatrixSortDirection = "asc" | "desc";

export interface MatrixSort {
  columnId: string;
  direction: MatrixSortDirection;
}

/** How a column filter compares: the value holds the text, or is it. */
export type MatrixColumnFilterMode = "contains" | "is";

/** A column's header filter. */
export interface MatrixColumnFilter {
  mode: MatrixColumnFilterMode;
  value: string;
}

export const MATRIX_COLUMN_FILTER_MODES: readonly MatrixColumnFilterMode[] = [
  "contains",
  "is",
];

/** What the grid asks its route for, besides the page's own URL. */
export interface MatrixQueryState {
  /** From 0. */
  page: number;
  pageSize: number;
  search: string;
  /** The status filter's segment, `""` for all. */
  status: string;
  /** The values picked in each facet, by facet id. */
  facets: Record<string, string[]>;
  sort: MatrixSort | null;
  /** The header filters in use, by column id. */
  filters: Record<string, MatrixColumnFilter>;
}

export const DEFAULT_MATRIX_PAGE_SIZE = 50;
export const DEFAULT_MATRIX_PAGE_SIZES = [25, 50, 100, 200];
/** Pages shown on each side of the current one in the pager. */
const PAGE_WINDOW = 2;
const FACET_PREFIX = "facet_";
const FILTER_PREFIX = "filter_";
const FILTER_SEPARATOR = ":";
const FACET_SEPARATOR = ",";

export function emptyMatrixQuery(pageSize: number): MatrixQueryState {
  return {
    page: 0,
    pageSize,
    search: "",
    status: "",
    facets: {},
    sort: null,
    filters: {},
  };
}

/** The query parameter a facet is sent under. */
export function facetParam(facetId: string): string {
  return `${FACET_PREFIX}${facetId}`;
}

/** The query parameter a column filter is sent under. */
export function columnFilterParam(columnId: string): string {
  return `${FILTER_PREFIX}${columnId}`;
}

/** `contains:alma`: a column filter as its parameter's value. */
export function columnFilterText(filter: MatrixColumnFilter): string {
  return `${filter.mode}${FILTER_SEPARATOR}${filter.value}`;
}

/** A column filter read back from its parameter's value, if it is one. */
export function parseColumnFilter(text: string): MatrixColumnFilter | null {
  const separator = text.indexOf(FILTER_SEPARATOR);
  if (separator < 0) return null;
  const mode = text.slice(0, separator) as MatrixColumnFilterMode;
  const value = text.slice(separator + 1);
  if (!MATRIX_COLUMN_FILTER_MODES.includes(mode) || !value) return null;
  return { mode, value };
}

/** The column a filter parameter names, if it is one. */
export function columnOfFilterParam(param: string): string | null {
  return param.startsWith(FILTER_PREFIX)
    ? param.slice(FILTER_PREFIX.length) || null
    : null;
}

/** The query parameters of the filters and the sort, without the page. */
export function matrixFilterParams(
  state: MatrixQueryState,
): Record<string, string> {
  const params: Record<string, string> = {};
  const search = state.search.trim();
  if (search) params.search = search;
  if (state.status) params.status = state.status;
  for (const [id, values] of Object.entries(state.facets)) {
    if (values.length) params[facetParam(id)] = values.join(FACET_SEPARATOR);
  }
  for (const [columnId, filter] of Object.entries(state.filters)) {
    if (filter.value)
      params[columnFilterParam(columnId)] = columnFilterText(filter);
  }
  if (state.sort) {
    params.sort = state.sort.columnId;
    params.direction = state.sort.direction;
  }
  return params;
}

/**
 * Every query parameter of a read: the filters and the sort, plus `offset`
 * and `limit` for a paginated grid (`offset` given for an infinite one, which
 * reads page after page).
 */
export function buildMatrixQuery(
  state: MatrixQueryState,
  pagination: MatrixPagination,
  offset?: number,
): Record<string, string> {
  const params = matrixFilterParams(state);
  if (pagination === "none") return params;
  const start = offset ?? state.page * state.pageSize;
  return { ...params, offset: String(start), limit: String(state.pageSize) };
}

const SORT_CYCLE: Record<MatrixSortDirection, MatrixSortDirection | null> = {
  asc: "desc",
  desc: null,
};

/** A header click: ascending, then descending, then no sort. */
export function nextMatrixSort(
  current: MatrixSort | null,
  columnId: string,
): MatrixSort | null {
  if (!current || current.columnId !== columnId)
    return { columnId, direction: "asc" };
  const direction = SORT_CYCLE[current.direction];
  return direction ? { columnId, direction } : null;
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** A page button of the pager. */
export interface MatrixPagerPage {
  type: "page";
  /** From 0. */
  page: number;
}

/** The gap (…) between two page buttons that are not neighbours. */
export interface MatrixPagerGap {
  type: "gap";
  key: string;
}

export type MatrixPagerItem = MatrixPagerPage | MatrixPagerGap;

/**
 * The pager's buttons: the first and last pages, the ones around the current
 * page, and a gap (…) wherever pages are skipped.
 */
export function pagerItems(page: number, pageCount: number): MatrixPagerItem[] {
  const last = pageCount - 1;
  const pages = new Set([0, last]);
  for (let index = page - PAGE_WINDOW; index <= page + PAGE_WINDOW; index++) {
    if (index >= 0 && index <= last) pages.add(index);
  }
  const sorted = [...pages].sort((left, right) => left - right);
  const items: MatrixPagerItem[] = [];
  sorted.forEach((entry, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && entry - previous > 1)
      items.push({ type: "gap", key: `gap-${entry}` });
    items.push({ type: "page", page: entry });
  });
  return items;
}

/** The last page a total still reaches: a page past the end moves back. */
export function clampPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  return Math.min(page, pageCountOf(total, pageSize) - 1);
}

function rowMatches(row: MatrixRow, needle: string): boolean {
  const haystack = [
    row.id,
    typeof row.label === "string" ? row.label : "",
    ...Object.values(row.values).map(valueText),
  ];
  return haystack.some((text) => text.toLowerCase().includes(needle));
}

const FILTER_MATCHERS: Record<
  MatrixColumnFilterMode,
  (text: string, needle: string) => boolean
> = {
  contains: (text, needle) => text.includes(needle),
  is: (text, needle) => text === needle,
};

function matchesFilters(
  row: MatrixRow,
  filters: Record<string, MatrixColumnFilter>,
): boolean {
  return Object.entries(filters).every(([columnId, filter]) =>
    FILTER_MATCHERS[filter.mode](
      valueText(row.values[columnId]).toLowerCase(),
      filter.value.toLowerCase(),
    ),
  );
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return valueText(left).localeCompare(valueText(right), undefined, {
    numeric: true,
  });
}

/**
 * The rows of `staticData` under the grid's search, column filters, sort and page, read in
 * the browser as the route would (status and facets name a route's own
 * filters: static rows keep them all).
 */
export function applyStaticQuery(
  data: MatrixData,
  state: MatrixQueryState,
  pagination: MatrixPagination,
): MatrixData {
  const needle = state.search.trim().toLowerCase();
  let rows = data.rows.filter(
    (row) =>
      (!needle || rowMatches(row, needle)) &&
      matchesFilters(row, state.filters),
  );
  const sort = state.sort;
  if (sort) {
    const sign = sort.direction === "asc" ? 1 : -1;
    rows.sort(
      (left, right) =>
        sign *
        compareValues(left.values[sort.columnId], right.values[sort.columnId]),
    );
  }
  const total = rows.length;
  if (pagination === "pages") {
    const start = state.page * state.pageSize;
    rows = rows.slice(start, start + state.pageSize);
  }
  return { ...data, rows, total };
}
