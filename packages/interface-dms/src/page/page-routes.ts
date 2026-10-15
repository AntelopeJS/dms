/**
 * Where the backend serves the routes of every page controller: the page's
 * layout (`<prefix><page>/pagelayout`) and the routes its class declares.
 *
 * The frontend server proxies only the backend prefixes declared to it
 * (`/api/**` and `/dms/**` for the DMS), and answers every other path with a
 * page. A route served at the page's own path would be the page's, never the
 * backend's, so page controllers live under the DMS's namespace instead:
 * the route `@Get("/sessions")` of the page `/settings/user/security` is
 * `/dms/pages/settings/user/security/sessions`.
 */
export const PAGE_ROUTE_PREFIX = "/dms/pages";

/**
 * The backend path of a page's route, as the browser calls it.
 *
 * ```ts
 * pageRoutePath("/settings/user/security", "/sessions");
 * // "/dms/pages/settings/user/security/sessions"
 * ```
 *
 * @param pageSlug The page's full slug, such as `/settings/user/security`
 * @param route The route below the page, such as `/sessions`; none for the
 *   page controller's own path
 * @returns The path under {@link PAGE_ROUTE_PREFIX}, without a trailing slash
 */
export function pageRoutePath(pageSlug: string, route = ""): string {
  const path = `${PAGE_ROUTE_PREFIX}/${pageSlug}/${route}`.replace(/\/+/g, "/");
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
