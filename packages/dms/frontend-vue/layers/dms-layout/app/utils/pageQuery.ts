// The page URL's query as the server reads it for header-button availability.

/** The page query as the server reads it: one value per name, the last one. */
export function pageQueryValues(
  query: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).flatMap(([name, value]) => {
      const last = Array.isArray(value) ? value.at(-1) : value;
      return typeof last === "string" ? [[name, last]] : [];
    }),
  );
}

/** Whether two page queries hold the same values, in any order. */
export function isSamePageQuery(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const names = Object.keys(left);
  return (
    names.length === Object.keys(right).length &&
    names.every((name) => left[name] === right[name])
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
