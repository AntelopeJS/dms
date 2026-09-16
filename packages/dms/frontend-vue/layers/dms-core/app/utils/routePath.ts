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
