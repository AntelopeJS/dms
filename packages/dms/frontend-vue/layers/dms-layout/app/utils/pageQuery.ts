// The page URL's query as the server reads it for header-button availability.

/** The page query as the server reads it: one value per name, the last one. */
export function pageQueryValues(
  query: Record<string, unknown> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query ?? {}).flatMap(([name, value]) => {
      const last = Array.isArray(value) ? value.at(-1) : value;
      return typeof last === "string" ? [[name, last]] : [];
    }),
  );
}

// Query keys the DMS writes for the view itself, never for the record a page
// acts on: the row open in a side panel, the paused live mode, and a period
// selector's range (`<id>.period`, `<id>.compare`, `<id>.from`…).
const VIEW_STATE_KEYS = new Set(["record", "live"]);
const PERIOD_KEY = /\.(?:period|compare|from|to|compareFrom|compareTo)$/;

/** Whether a query key only records the view's own state. */
export function isViewStateKey(name: string): boolean {
  return VIEW_STATE_KEYS.has(name) || PERIOD_KEY.test(name);
}

function withoutViewState(
  query: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter(([name]) => !isViewStateKey(name)),
  );
}

/**
 * Whether two page queries hold the same values, in any order, leaving out
 * the keys that only record the view's state: moving through rows, pausing
 * the live mode or changing a period never asks the layout again.
 */
export function isSamePageQuery(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const kept = withoutViewState(left);
  const other = withoutViewState(right);
  const names = Object.keys(kept);
  return (
    names.length === Object.keys(other).length &&
    names.every((name) => kept[name] === other[name])
  );
}

/** The layout URL of a page, asked for the given query. */
export function layoutUrlWithQuery(
  layoutUrl: string,
  query: Record<string, string>,
): string {
  const search = new URLSearchParams(query).toString();
  return search ? `${layoutUrl}?${search}` : layoutUrl;
}
