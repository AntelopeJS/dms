/** @internal @packageDocumentation */
import type { joinPageSlug, FormRouteFrame } from "./factory-helpers";

export function toFormPageUrl(
  pageSlug: string,
  slug: string,
  joinSlug: typeof joinPageSlug,
): string {
  if (slug.startsWith("/")) return slug;
  const parts = slug.split("/");
  let parentCount = 0;
  while (parentCount < parts.length && parts[parentCount] === "..") {
    parentCount++;
  }
  const segments = pageSlug.replace(/\/$/, "").split("/");
  return joinSlug(
    segments.slice(0, segments.length - parentCount).join("/"),
    parts.slice(parentCount).join("/"),
  );
}

function slugPlaceholders(slug: string): string[] {
  return slug
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.substring(1));
}

const countOccurrences = (names: string[], name: string): number =>
  names.filter((candidate) => candidate === name).length;

/**
 * The token reading, on a form page, an occurrence of the route parameter
 * `name` of the page carrying the table view — by default its last, the value
 * its `routeParamFilters` filter on.
 *
 * The bare name holds the last occurrence of a repeated placeholder, which on
 * a form route is the form's own (`/workspaces/:id/invoiceTable/:id/edit`:
 * the row id). The page's placeholders precede the form's, so the page's
 * occurrence is addressed by its number. Numbered keys exist only for repeated
 * names, hence the bare name otherwise.
 */
export function pageParamToken(
  name: string,
  frame?: FormRouteFrame,
  occurrence?: number,
): string {
  if (!frame) return `{{params.${name}}}`;
  const pageOccurrence =
    occurrence ?? countOccurrences(slugPlaceholders(frame.pageSlug), name);
  const total = countOccurrences(slugPlaceholders(frame.formSlug), name);
  return pageOccurrence > 0 && total > 1
    ? `{{params.${name}:${pageOccurrence}}}`
    : `{{params.${name}}}`;
}
