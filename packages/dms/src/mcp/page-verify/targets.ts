import type { PageInfo } from "@antelopejs/interface-dms/page";
import { pagesBySlug } from "../../utils";
import { normalizeRoute, servesRoute } from "../tools/pages";

const PARAM_PREFIX = ":";

/** A registered page, at the route a caller asked for. */
export interface PageTarget {
  /** The route opened, such as `/orders/42`. */
  route: string;
  info: PageInfo;
  /** The dashboard path of the page's layout endpoint, its parameters filled. */
  layoutPath: string;
}

function fillParams(template: string, slug: string, route: string): string {
  const values = new Map<string, string>();
  const routeSegments = route.split("/");
  normalizeRoute(slug)
    .split("/")
    .forEach((segment, index) => {
      if (segment.startsWith(PARAM_PREFIX)) {
        values.set(segment, routeSegments[index] ?? "");
      }
    });
  return template
    .split("/")
    .map((segment) => values.get(segment) ?? segment)
    .join("/");
}

/**
 * The registered page a caller names, by the route it is served at (a
 * concrete one for a page with parameters) or by its full id.
 */
export function resolvePage(name: string): PageTarget | undefined {
  const pages = Object.values(pagesBySlug);
  const byId = pages.find((page) => page.fullId === name);
  const route = normalizeRoute(byId?.fullSlug ?? name);
  const info = byId ?? pages.find((page) => servesRoute(page.fullSlug, route));
  if (info === undefined) return undefined;
  return {
    route,
    info,
    layoutPath: fillParams(info.layoutUrl, info.fullSlug, route),
  };
}

/** Some registered routes, for an error naming a page that is none. */
export function knownRoutes(limit: number): string[] {
  return Object.keys(pagesBySlug).slice(0, limit);
}
