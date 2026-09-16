import type { MenuItemParams } from "@antelopejs/interface-dms/page";

const SLUG_SEPARATOR = "/";
const ROUTE_PARAM_PREFIX = ":";

// Fills the `:name` segments of a page slug. An unfilled segment would ship a
// literal `:name` link, and a parameter filling none is most likely a typo, so
// either leaves the entry without a link.
export function fillRouteParams(
  fullSlug: string,
  params: MenuItemParams = {},
): string | undefined {
  const filled = new Set<string>();
  const segments = fullSlug.split(SLUG_SEPARATOR).map((segment) => {
    if (!segment.startsWith(ROUTE_PARAM_PREFIX)) return segment;
    const name = segment.slice(ROUTE_PARAM_PREFIX.length);
    const value = params[name];
    if (!value) return undefined;
    filled.add(name);
    return encodeURIComponent(value);
  });
  if (segments.includes(undefined)) return undefined;
  if (filled.size !== Object.keys(params).length) return undefined;
  return segments.join(SLUG_SEPARATOR);
}
