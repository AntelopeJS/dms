import type { MatrixFacetItem } from "@antelopejs/interface-dms/base/matrix";

const FACET_PREFIX = "facet_";
const LIST_SEPARATOR = ",";
const DESCENDING = "desc";
// Park-Miller's minimal standard generator, and the FNV-1a 32-bit hash.
const PARK_MILLER_MULTIPLIER = 48271;
const PARK_MILLER_MODULUS = 2147483647;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const PERCENT = 100;

export type SortDirection = "asc" | "desc";

/**
 * What a Matrix sends its `fetchUrl`: `offset` and `limit` when paginated,
 * `search`, `status`, `sort` and `direction`, and one `facet_<id>=a,b` per
 * facet in use.
 */
export interface MatrixQuery {
  offset: number;
  /** Absent: every row from `offset`. */
  limit?: number;
  /** Lower-cased and trimmed; empty when there is no search. */
  search: string;
  status?: string;
  sort?: string;
  direction: SortDirection;
  /** The values picked in each facet, by facet id. */
  facets: Record<string, string[]>;
}

/** Reads a value of an item by a column id, for sorting. */
export type CellReader<T> = (item: T, columnId: string) => unknown;

function readFacets(params: URLSearchParams): Record<string, string[]> {
  const facets: Record<string, string[]> = {};
  params.forEach((value, key) => {
    if (!key.startsWith(FACET_PREFIX)) return;
    const picked = value.split(LIST_SEPARATOR).filter(Boolean);
    if (picked.length) facets[key.slice(FACET_PREFIX.length)] = picked;
  });
  return facets;
}

function readPositive(params: URLSearchParams, key: string): number {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Parses the query string a Matrix sends its route. */
export function readMatrixQuery(params: URLSearchParams): MatrixQuery {
  const limit = readPositive(params, "limit");
  return {
    offset: readPositive(params, "offset"),
    limit: limit || undefined,
    search: (params.get("search") ?? "").trim().toLowerCase(),
    status: params.get("status") || undefined,
    sort: params.get("sort") || undefined,
    direction: params.get("direction") === DESCENDING ? "desc" : "asc",
    facets: readFacets(params),
  };
}

/** The slice of the matching items the grid asked for. */
export function pageOf<T>(items: T[], query: MatrixQuery): T[] {
  const end =
    query.limit === undefined ? undefined : query.offset + query.limit;
  return items.slice(query.offset, end);
}

/** Whether a facet lets a value through: an unused facet lets everything. */
export function facetAllows(
  query: MatrixQuery,
  facetId: string,
  value: string,
): boolean {
  const picked = query.facets[facetId];
  return !picked || picked.includes(value);
}

/** Whether any of the texts holds the search (already lower-cased). */
export function matchesSearch(search: string, texts: unknown[]): boolean {
  if (!search) return true;
  return texts.some(
    (text) =>
      text !== null &&
      text !== undefined &&
      searchableText(text).toLowerCase().includes(search),
  );
}

function searchableText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Orders two cell values: empty ones last, numbers and booleans by value, the
 * rest (dates as ISO strings, texts, objects) as text.
 */
export function compareCells(left: unknown, right: unknown): number {
  if (isEmpty(left) || isEmpty(right)) {
    return Number(isEmpty(left)) - Number(isEmpty(right));
  }
  if (typeof left === "number" || typeof left === "boolean") {
    return Number(left) - Number(right);
  }
  return searchableText(left).localeCompare(searchableText(right));
}

/** The items ordered by the column the grid sorts on, when it sorts. */
export function sortItems<T>(
  items: T[],
  query: MatrixQuery,
  read: CellReader<T>,
): T[] {
  const { sort } = query;
  if (!sort) return items;
  const sign = query.direction === DESCENDING ? -1 : 1;
  return [...items].sort(
    (left, right) => compareCells(read(left, sort), read(right, sort)) * sign,
  );
}

/** The facet choices of a list, each with how many items hold it. */
export function facetItems<T>(
  items: T[],
  valueOf: (item: T) => string,
  labels: Record<string, string>,
): MatrixFacetItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = valueOf(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.entries(labels).map(([value, label]) => ({
    value,
    label,
    count: counts.get(value) ?? 0,
  }));
}

/** A small deterministic generator, so every restart seeds the same data. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return state / PARK_MILLER_MODULUS;
  };
}

/** A stable number from 0 to 99 for a text: which cell is missing, which is wrong. */
export function percentileOf(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return Math.abs(hash) % PERCENT;
}
