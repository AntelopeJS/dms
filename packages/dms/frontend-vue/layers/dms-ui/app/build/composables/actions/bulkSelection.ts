import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomRowAction } from "../../../types/row-action";

/** Query flag of a bulk request covering every matching row. */
export const ALL_MATCHING_QUERY_KEY = "allMatching";
const IDS_QUERY_KEY = "ids";

/**
 * The rows a bulk action runs on: the selected ids, or every row the table's
 * filters match (`matching`, the list query without paging).
 */
export interface BulkSelection {
  ids?: string[];
  matching?: Record<string, unknown>;
  /** How many rows that is. */
  count: number;
}

type QueryValue = string | string[];

/** The query a bulk request carries: `ids=a&ids=b`, or the filters. */
export function bulkSelectionQuery(
  selection: BulkSelection,
): Record<string, QueryValue> {
  if (selection.ids) return { [IDS_QUERY_KEY]: [...selection.ids] };
  const query: Record<string, QueryValue> = {
    [ALL_MATCHING_QUERY_KEY]: "true",
  };
  for (const [key, value] of Object.entries(selection.matching ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      query[key] = String(value);
    }
  }
  return query;
}

/** `url` with `query` appended, a list value as a repeated key. */
export function withQuery(url: string, query: Record<string, QueryValue>) {
  const [path, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }
  const joined = params.toString();
  return joined ? `${path}?${joined}` : (path ?? url);
}

const URL_TARGET_TYPES = new Set(["page", "external", "api", "exportJob"]);

/** A target sending the selection along: its URL carries the query. */
export function targetWithSelection(
  target: ActionTarget,
  query: Record<string, QueryValue>,
): ActionTarget {
  if (!URL_TARGET_TYPES.has(target.type)) return target;
  const { url } = target as ActionTarget & { url: string };
  return { ...target, url: withQuery(url, query) } as ActionTarget;
}

/** Whether a custom action runs on the selection bar. */
export const isBulkAction = (action: CustomRowAction): boolean => !!action.bulk;

/** Whether a custom action runs on every matching row too. */
export const isAllMatchingAction = (action: CustomRowAction): boolean =>
  typeof action.bulk === "object" && !!action.bulk.allMatching;
