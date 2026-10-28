import type { TableUrlFilter } from "../../../components/table/Table.vue";
import type { QueryParamFilters } from "../../../../composables/table-view/types/config";
import type { LocationQuery } from "#dms/frontend-module";

const DEFAULT_FILTER_MODE = "is";

/** The `queryParamFilters` declared `visible` that the URL applies now. */
export function visibleUrlFilters(
  filters: QueryParamFilters | undefined,
  query: LocationQuery,
): TableUrlFilter[] {
  return Object.entries(filters ?? {})
    .filter(([param, config]) => config.visible && query[param] !== undefined)
    .map(([param, config]) => ({
      param,
      label: config.label,
      accessorKey: config.field,
      mode: config.mode || DEFAULT_FILTER_MODE,
      value: query[param],
    }));
}

/** The URL query without `param`, for a chip the user removed. */
export function withoutQueryParam<Query extends LocationQuery>(
  query: Query,
  param: string,
) {
  const { [param]: _removed, ...rest } = query;
  return rest;
}

/** The query of a URL, absolute or relative to the page, one value per key. */
export function queryOfUrl(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, "http://dms.invalid").searchParams);
}

/**
 * The query the browser shows, else the route's on a server render. A table
 * writes some keys in place (the open `?record=`, removed on close), so the
 * route, which follows the last visit, can still hold a key the browser no
 * longer shows: a visit rebuilt from it would bring the key back.
 */
export function currentQuery(routeQuery: LocationQuery): LocationQuery {
  if (typeof window === "undefined") return routeQuery;
  return queryOfUrl(window.location.href);
}
