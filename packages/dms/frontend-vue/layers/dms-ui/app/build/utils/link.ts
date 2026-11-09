import { pageLink } from "../composables/page/pageUrlValues";

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

function pathOnThisSite(to: string): string {
  const url = new URL(to, window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function isPlainClick(event: MouseEvent): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
}

/**
 * Props for a `UButton` (or `ULink`) following `to`, its page tokens
 * (`{{params.X}}`, `{{query.X}}`) filled: an external target opens in a new
 * tab, the others navigate in place. A DMS route keeps its `href` for a new
 * tab, but a plain click goes through `navigateDms`, read against the page
 * on screen, so a link that changes only the query (`?status=pending` or a
 * full path) stays in the browser: Nuxt UI's Inertia link, which
 * `external` turns off, would ask the server for the page.
 */
export function buttonLinkProps(declared: string | undefined) {
  const to = pageLink(declared);
  if (!to) return {};
  const kind = linkKind(to);
  if (kind === "external") return { to, ...EXTERNAL_LINK_ATTRIBUTES };
  if (kind === "anchor") return { to };
  return {
    to,
    external: true,
    noRel: true,
    onClick: (event: MouseEvent) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      void navigateDms(pathOnThisSite(to));
    },
  };
}
