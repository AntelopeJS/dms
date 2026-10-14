import {
  namesPageValue,
  type ReplaceUrlVariablesContext,
  resolveLinkVariables,
  resolveUrlVariables,
} from "../../utils/urlVariables";

/**
 * The values of the page being shown that a `{{params.X}}` / `{{query.X}}`
 * token names: the route parameters of the DMS page matching the URL, and its
 * query. Read when called, so it follows the URL as it changes.
 */
export function currentPageUrlValues(): ReplaceUrlVariablesContext {
  const route = useDmsRoute();
  return {
    routeParams: useSiteLayout().findMatchingRoute(route.path)?.params,
    routeQuery: route.query as Record<string, unknown>,
  };
}

/**
 * A link declared on a block (`to`) with the page's tokens filled, as a page
 * header button's: a query pair the page has no value for is left out. The
 * route is only read for a link holding a token.
 */
export function pageLink(to: string): string;
export function pageLink(to: string | undefined): string | undefined;
export function pageLink(to: string | undefined): string | undefined {
  if (!to || !namesPageValue(to)) return to;
  return resolveLinkVariables(to, currentPageUrlValues());
}

/**
 * A route a field or block requests (`searchUrl`, `rotateUrl`, …) with the
 * page's tokens filled, or `undefined` while one has no value, as a block's
 * `fetchUrl`.
 */
export function pageRequestUrl(url: string | undefined): string | undefined {
  if (!url || !namesPageValue(url)) return url;
  return resolveUrlVariables(url, currentPageUrlValues());
}
