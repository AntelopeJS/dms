import type { PageValidation } from "../types/page";

export interface BreadcrumbTargetSource {
  layoutUrl?: string;
  validation?: PageValidation;
}

/**
 * The link of a breadcrumb crumb. A page that declares
 * `validation.requiredQueryParams` 404s without them, so its crumb carries the
 * values the current URL holds for them, and gets no link when any is missing.
 * Categories without a page behind them get no link either.
 */
export function buildBreadcrumbTarget(
  path: string,
  metadata: BreadcrumbTargetSource,
  currentQuery: Record<string, unknown>,
): string | undefined {
  if (!metadata.layoutUrl) {
    return undefined;
  }

  const requiredParams = metadata.validation?.requiredQueryParams ?? [];
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
