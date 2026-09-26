import type { PageValidation } from "../types/page";

export interface BreadcrumbTargetSource {
  layoutUrl?: string;
  validation?: PageValidation;
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
 * The link of a breadcrumb crumb: the page's {@link buildPageTarget}.
 * Categories without a page behind them get no link.
 */
export function buildBreadcrumbTarget(
  path: string,
  metadata: BreadcrumbTargetSource,
  currentQuery: Record<string, unknown>,
): string | undefined {
  if (!metadata.layoutUrl) {
    return undefined;
  }

  return buildPageTarget(path, metadata.validation, currentQuery);
}
