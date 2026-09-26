const QUERY_OR_HASH = /[?#]/;

/**
 * The path part of a link, dropping its query and hash. Entries of a
 * query-parameter page share one registered slug, so anything keyed on the
 * registered route — a prefetch, a layout lookup — keys on this.
 */
export function stripQueryAndHash(link: string): string {
  const [path] = link.split(QUERY_OR_HASH);
  return path ?? link;
}

/**
 * A link to `path` narrowed by `query`, as the single string every link
 * renderer accepts: the Inertia-backed `ULink` only takes a string `to`, and
 * stringifies an object into `[object Object]`.
 */
export function buildLinkWithQuery(
  path: string,
  query: Record<string, string> | undefined,
): string {
  const search = new URLSearchParams(query ?? {}).toString();
  return search === "" ? path : `${path}?${search}`;
}

/** The query parameters a link carries, the inverse of `buildLinkWithQuery`. */
export function parseLinkQuery(link: string): Record<string, string> {
  const [withoutHash = ""] = link.split("#");
  const queryStart = withoutHash.indexOf("?");
  if (queryStart === -1) return {};
  return Object.fromEntries(
    new URLSearchParams(withoutHash.slice(queryStart + 1)),
  );
}
