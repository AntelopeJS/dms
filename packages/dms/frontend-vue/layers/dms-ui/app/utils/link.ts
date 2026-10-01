// How a link target configured on a block is followed. Block options are plain
// strings, so the kind is read off the string itself: an in-page anchor stays a
// bare `<a href="#…">` (an Inertia visit would reload the page to scroll), an
// absolute URL opens in a new tab, and everything else is a DMS route.

export type LinkKind = "internal" | "anchor" | "external";

const EXTERNAL_LINK_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/** Where `to` leads: a DMS route, an anchor on this page, or another site. */
export function linkKind(to: string): LinkKind {
  if (to.startsWith("#")) return "anchor";
  return EXTERNAL_LINK_PATTERN.test(to) ? "external" : "internal";
}

/** Attributes that open an external link safely in a new tab. */
export const EXTERNAL_LINK_ATTRIBUTES = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/**
 * Props for a `UButton` (or `ULink`) following `to`: an external target opens
 * in a new tab, the others navigate in place.
 */
export function buttonLinkProps(
  to: string | undefined,
): Record<string, string> {
  if (!to) return {};
  return linkKind(to) === "external"
    ? { to, ...EXTERNAL_LINK_ATTRIBUTES }
    : { to };
}
