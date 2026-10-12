import type { TableUrlFilter } from "../../../components/table/Table.vue";
import type { QueryParamFilters } from "../../../../composables/table-view/types/config";

const DEFAULT_FILTER_MODE = "is";

/** The `queryParamFilters` declared `visible` that the URL applies now. */
export function visibleUrlFilters(
  filters: QueryParamFilters | undefined,
  query: Record<string, unknown>,
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
export function withoutQueryParam<Query extends Record<string, unknown>>(
  query: Query,
  param: string,
): Query {
  const { [param]: _removed, ...rest } = query;
  return rest as Query;
}
