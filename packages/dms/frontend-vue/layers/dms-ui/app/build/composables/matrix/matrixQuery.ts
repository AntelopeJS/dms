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
}

export const DEFAULT_MATRIX_PAGE_SIZE = 50;
export const DEFAULT_MATRIX_PAGE_SIZES = [25, 50, 100, 200];
/** Pages shown on each side of the current one in the pager. */
const PAGE_WINDOW = 2;
const FACET_PREFIX = "facet_";
const FACET_SEPARATOR = ",";

export function emptyMatrixQuery(pageSize: number): MatrixQueryState {
  return {
    page: 0,
    pageSize,
    search: "",
    status: "",
    facets: {},
    sort: null,
  };
}

/** The query parameter a facet is sent under. */
export function facetParam(facetId: string): string {
  return `${FACET_PREFIX}${facetId}`;
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

/** A page button, or the gap between two that are not neighbours. */
export type MatrixPagerItem =
  | { type: "page"; page: number }
  | { type: "gap"; key: string };

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

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  return valueText(left).localeCompare(valueText(right), undefined, {
    numeric: true,
  });
}

/**
 * The rows of `staticData` under the grid's search, sort and page, read in
 * the browser as the route would (status and facets name a route's own
 * filters: static rows keep them all).
 */
export function applyStaticQuery(
  data: MatrixData,
  state: MatrixQueryState,
  pagination: MatrixPagination,
): MatrixData {
  const needle = state.search.trim().toLowerCase();
  let rows = needle
    ? data.rows.filter((row) => rowMatches(row, needle))
    : [...data.rows];
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
