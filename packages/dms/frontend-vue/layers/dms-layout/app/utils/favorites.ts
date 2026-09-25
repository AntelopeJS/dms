import { getQuery, parseURL } from "ufo";
import type { FavoritePage } from "../composables/favorites/useFavoritePages";
import type { PageValidation } from "../types/page";
import { buildPageTarget } from "./breadcrumb";

const FAVORITE_TITLE_SEPARATOR = " · ";

export interface FavoritePageMetadata {
  id?: string;
  displayName?: string;
  icon?: string;
  validation?: PageValidation;
}

export interface FavoritePageSource {
  path: string;
  metadata: FavoritePageMetadata;
  query: Record<string, unknown>;
  translate: (text: string) => string;
  /** The page heading as rendered, which names the entity a page is showing. */
  renderedHeading?: string;
}

export type FavoriteRouteResolver = (
  path: string,
) => { metadata: FavoritePageMetadata } | null;

function requiredQueryValues(
  validation: PageValidation | undefined,
  query: Record<string, unknown>,
): string[] {
  return (validation?.requiredQueryParams ?? []).map((param) =>
    String(query[param]),
  );
}

// A page narrowed by its query shows one entity out of many: its generic
// display name would label every favorite of it the same way.
function entityTitle(
  pageTitle: string,
  queryValues: string[],
  renderedHeading: string | undefined,
): string {
  const heading = renderedHeading?.trim();
  if (heading && heading !== pageTitle) {
    return heading;
  }
  return [pageTitle, ...queryValues].join(FAVORITE_TITLE_SEPARATOR);
}

/**
 * The favorite that reopens the page at `path` as it is showing now. A page
 * requiring query parameters keeps them in its path and gets a title telling
 * its entities apart; there is no favorite when a required value is missing.
 */
export function buildFavoritePage(
  source: FavoritePageSource,
): FavoritePage | null {
  const { path, metadata, query } = source;
  const target = buildPageTarget(path, metadata.validation, query);
  if (!target) {
    return null;
  }

  const displayName = metadata.displayName || path;
  const queryValues = requiredQueryValues(metadata.validation, query);
  if (queryValues.length === 0) {
    return {
      id: metadata.id || path,
      path,
      title: displayName,
      icon: metadata.icon,
    };
  }

  return {
    id: target,
    path: target,
    title: entityTitle(
      source.translate(displayName),
      queryValues,
      source.renderedHeading,
    ),
    icon: metadata.icon,
  };
}

/**
 * Whether a stored favorite still opens a page: its path matches one, and its
 * query holds every value that page requires.
 */
export function isFavoritePathValid(
  favoritePath: string,
  resolveRoute: FavoriteRouteResolver,
): boolean {
  const { pathname } = parseURL(favoritePath);
  const route = resolveRoute(pathname);
  if (!route) {
    return false;
  }
  return (
    buildPageTarget(
      pathname,
      route.metadata.validation,
      getQuery(favoritePath),
    ) !== undefined
  );
}
