// Mirror of PAGE_ROUTE_PREFIX and pageRoutePath from
// @antelopejs/interface-dms/page.

/**
 * Where the backend serves the routes a page controller declares, and its
 * layout: under the DMS's own prefix, which the frontend server proxies. The
 * page's own path is the page, never a backend route.
 */
export const PAGE_ROUTE_PREFIX = "/dms/pages";

/**
 * The backend path of a page's route, as the browser calls it:
 * `pageRoutePath("/settings/user/security", "/sessions")` is
 * `/dms/pages/settings/user/security/sessions`.
 *
 * @param pageSlug The page's path, such as `/settings/user/security`
 * @param route The route below the page; none for the page's own route
 */
export function pageRoutePath(pageSlug: string, route = ""): string {
  const path = `${PAGE_ROUTE_PREFIX}/${pageSlug}/${route}`.replace(/\/+/g, "/");
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
