import type { MockupPageState } from "./mockup";

/** Where the viewer draws a mockup: a spec's `page:<id>` link compiles to it. */
export const MOCKUP_VIEWER_PATH = "/mockup";

const PAGE_QUERY = "page";

/** The viewer's query naming the row a page with a route shows. */
export const RECORD_QUERY = "record";

/** A page of the mockup a link opens, and the row it shows there. */
export interface MockupLink {
  page: string;
  record?: string;
}

/**
 * The mockup page `href` links to, read against `base`, or undefined for a
 * link anywhere else: another site, another page of the dashboard, or a
 * viewer URL naming no page.
 */
export function mockupLinkOf(
  href: string,
  base: string,
): MockupLink | undefined {
  if (!URL.canParse(href, base)) return undefined;
  const url = new URL(href, base);
  if (url.origin !== new URL(base).origin) return undefined;
  if (url.pathname !== MOCKUP_VIEWER_PATH) return undefined;
  const page = url.searchParams.get(PAGE_QUERY);
  if (!page) return undefined;
  const record = url.searchParams.get(RECORD_QUERY);
  return record ? { page, record } : { page };
}

/**
 * The row a page opens on when a link of the page on screen names none: the
 * row on screen, when the link goes to a sub-page of it that takes a row, as
 * a detail page's link to its own edit page does. Else none, and the page
 * shows its sample row.
 */
export function followedRecord(
  target: Pick<MockupPageState, "parent" | "route"> | undefined,
  current: Pick<MockupPageState, "id" | "route"> | undefined,
  record: string | undefined,
): string | undefined {
  if (!target?.route || !current?.route || target.parent !== current.id) {
    return undefined;
  }
  return record ?? current.route.sample;
}

/**
 * The route parameters the blocks of `page` fill their `{{params.X}}` tokens
 * with: its route's, set to the row a link named, else to its sample row.
 * None for a page without a route, or with no row to show.
 */
export function mockupPageParams(
  page: Pick<MockupPageState, "route">,
  record: string | undefined,
): Record<string, string> | undefined {
  const value = record ?? page.route?.sample;
  return page.route && value !== undefined
    ? { [page.route.param]: value }
    : undefined;
}
