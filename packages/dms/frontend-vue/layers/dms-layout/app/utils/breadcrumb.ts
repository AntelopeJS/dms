import { isString } from "../../../dms-core/app/utils/type-check";
import type { PageValidation } from "../types/page";
import type { MenuRouteState } from "#dms-core/app/types/menu";

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
  currentQuery: MenuRouteState["query"],
): string | undefined {
  const requiredParams = validation?.requiredQueryParams ?? [];
  const carriedQuery = new URLSearchParams();

  for (const param of requiredParams) {
    const value = currentQuery[param];
    if (!isString(value) || value === "") {
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
  currentQuery: MenuRouteState["query"],
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- T is unconstrained and no full FoldedCrumbs validation exists. Constraining T or adding object guards would change the existing public predicate and malformed-input behavior.
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

/** What a crumb is compared on: the URL it opens. */
interface LinkedCrumb {
  to?: unknown;
}

/**
 * `crumbs` with the crumb of the page the current one is a detail of
 * (`MenuOptions.parent`) before the last, unless a crumb already opens it:
 * a hidden detail page then leads back to its list.
 */
export function withParentCrumb<T extends object>(
  crumbs: readonly T[],
  parent: T | null | undefined,
): T[] {
  if (!parent || crumbs.length < 2) return [...crumbs];
  const { to: parentTo }: LinkedCrumb = parent;
  if (
    crumbs.some(
      (crumb: LinkedCrumb) => parentTo !== undefined && crumb.to === parentTo,
    )
  ) {
    return [...crumbs];
  }
  return [...crumbs.slice(0, -1), parent, crumbs.at(-1)!];
}
