import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomRowAction } from "../../../types/row-action";
import { namesRowField } from "#dms-core/app/utils/url-interpolation";
import { dropRowTokens } from "../../utils/urlVariables";

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

const FRAGMENT_SEPARATOR = "#";

/**
 * `url` with `query` appended, a list value as a repeated key. The URL's own
 * query is kept as written: its tokens (`{{query.X}}`, `{{row.X}}`) are filled
 * after, which percent-encoded braces would no longer match.
 */
export function withQuery(url: string, query: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }
  const appended = params.toString();
  if (!appended) return url;
  const [base = "", ...fragment] = url.split(FRAGMENT_SEPARATOR);
  const separator = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";
  return [`${base}${separator}${appended}`, ...fragment].join(
    FRAGMENT_SEPARATOR,
  );
}

const URL_TARGET_TYPES = new Set([
  "page",
  "external",
  "download",
  "api",
  "exportJob",
]);

type UrlTarget = ActionTarget & { url: string };

const isUrlTarget = (target: ActionTarget): target is UrlTarget =>
  URL_TARGET_TYPES.has(target.type);

/**
 * A target sending the selection along: its URL carries the query. Sent
 * without a row, its `{{row.X}}` tokens are taken out (a `?ids={{row._id}}`
 * pair gives way to the selection's `ids`).
 */
export function targetWithSelection(
  target: ActionTarget,
  query: Record<string, QueryValue>,
): ActionTarget {
  if (!isUrlTarget(target)) return target;
  const url = withQuery(dropRowTokens(target.url), query);
  return { ...target, url } as ActionTarget;
}

/**
 * A bulk action's target run on one row: its URL carries that row's id as the
 * selection bar's carries the selection's, unless it names the row itself
 * (`{{row._id}}`), which then fills it.
 */
export function targetForRow(
  target: ActionTarget,
  query: Record<string, QueryValue>,
): ActionTarget {
  if (!isUrlTarget(target) || namesRowField(target.url)) return target;
  return { ...target, url: withQuery(target.url, query) } as ActionTarget;
}

/** Whether a custom action runs on the selection bar. */
export const isBulkAction = (action: CustomRowAction): boolean => !!action.bulk;

/** Whether a custom action runs on every matching row too. */
export const isAllMatchingAction = (action: CustomRowAction): boolean =>
  typeof action.bulk === "object" && !!action.bulk.allMatching;
