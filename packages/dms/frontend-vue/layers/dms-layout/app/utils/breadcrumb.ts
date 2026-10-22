import type { PageValidation } from "../types/page";

export interface BreadcrumbTargetSource {
  layoutUrl?: string;
  validation?: PageValidation;
  /** A module's root: the page the module opens on, its crumb's link. */
  landingSlug?: string;
}

/**
 * The URL that opens the page at `path`. A page that declares
 * `validation.requiredQueryParams` 404s without them, so the URL carries the
 * values `currentQuery` holds for them — and only those — and there is no URL
 * when any is missing, empty or repeated.
 */
export function buildPageTarget(
  path: string,
  validation: PageValidation | undefined,
  currentQuery: Record<string, unknown>,
): string | undefined {
  const requiredParams = validation?.requiredQueryParams ?? [];
  const carriedQuery = new URLSearchParams();

  for (const param of requiredParams) {
    const value = currentQuery[param];
    if (typeof value !== "string" || value === "") {
      return undefined;
    }
    carriedQuery.set(param, value);
  }

  const search = carriedQuery.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * The link of a breadcrumb crumb: the page's {@link buildPageTarget}. A
 * module's root links to its landing page; other categories without a page
 * behind them get no link.
 */
export function buildBreadcrumbTarget(
  path: string,
  metadata: BreadcrumbTargetSource,
  currentQuery: Record<string, unknown>,
): string | undefined {
  if (!metadata.layoutUrl) {
    return metadata.landingSlug;
  }

  return buildPageTarget(path, metadata.validation, currentQuery);
}

/** The crumb a folded breadcrumb shows for the crumbs it hides. */
export interface FoldedCrumbs<T> {
  isFolded: true;
  slot: string;
  children: T[];
}

export function isFoldedCrumbs<T>(
  crumb: T | FoldedCrumbs<T>,
): crumb is FoldedCrumbs<T> {
  return (crumb as Partial<FoldedCrumbs<T>>).isFolded === true;
}

/**
 * A phone's breadcrumb: the first and the last crumb, the ones between
 * folded into one `slot` crumb. A single crumb between them stays as it is,
 * a "…" holding one name only hid it.
 */
export function foldBreadcrumb<T>(
  crumbs: readonly T[],
  slot: string,
): (T | FoldedCrumbs<T>)[] {
  if (crumbs.length <= 3) return [...crumbs];
  return [
    crumbs[0]!,
    { isFolded: true, slot, children: crumbs.slice(1, -1) },
    crumbs.at(-1)!,
  ];
}
