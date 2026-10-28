import { isString } from "../../utils/type-check";
import type { ValidationRouteContext } from "../../utils/query-validation";

/** The keys one `PeriodSelector` keeps its period under in the page URL. */
export interface PeriodQueryKeys {
  period: string;
  compare: string;
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
}

const QUERY_SEPARATOR = "?";
const FRAGMENT_SEPARATOR = "#";

/**
 * The keys of selector `id` in the page URL (`<id>.period`), or the bare keys
 * (`period`) of a selection kept on its own.
 */
export function periodQueryKeys(id?: string): PeriodQueryKeys {
  const prefix = id ? `${id}.` : "";
  return {
    period: `${prefix}period`,
    compare: `${prefix}compare`,
    from: `${prefix}from`,
    to: `${prefix}to`,
    compareFrom: `${prefix}compareFrom`,
    compareTo: `${prefix}compareTo`,
  };
}

function firstText(
  value: Parameters<typeof withPeriodQuery>[1][string],
): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return isString(text) && text ? text : undefined;
}

/**
 * `link` carrying the period selector `id` shows in `query` (the route query
 * of the page it is followed from), so the page it opens, holding a selector
 * with the same `id`, shows the same period. A key the link names itself
 * wins, and a key the query does not hold is left out.
 */
export function withPeriodQuery(
  link: string,
  query: ValidationRouteContext["query"],
  id: string,
): string {
  const [beforeFragment = "", ...fragment] = link.split(FRAGMENT_SEPARATOR);
  const [path = "", ...search] = beforeFragment.split(QUERY_SEPARATOR);
  const params = new URLSearchParams(search.join(QUERY_SEPARATOR));
  for (const key of Object.values(periodQueryKeys(id))) {
    const value = firstText(query[key]);
    if (value && !params.has(key)) params.set(key, value);
  }
  const text = params.toString();
  return [text ? `${path}${QUERY_SEPARATOR}${text}` : path, ...fragment].join(
    FRAGMENT_SEPARATOR,
  );
}
