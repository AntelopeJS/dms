// The navigation badges the pages publish (a table view tab declared with
// `navBadge`), counted for the caller when the menu is served and written
// where a static `badge` would sit, in the tree and on the page entries.

import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  type NavBadges,
  ResolveNavBadges,
} from "@antelopejs/interface-dms/page/nav-badges";
import { withResolverTimeout } from "./resolver-timeout";

/** What the menu payload carries per entry, as far as the badges go. */
interface BadgedEntry {
  fullId: string;
  badge?: string;
  hasAccess?: boolean;
}

interface BadgedTree extends BadgedEntry {
  children: Record<string, BadgedTree>;
}

/**
 * The badges of the pages among `entries` the caller can open; none for an
 * anonymous caller, or when counting fails or outlasts the resolver timeout.
 */
export async function resolveMenuNavBadges(
  ctx: RequestContext | undefined,
  user: User | undefined,
  entries: BadgedEntry[],
): Promise<NavBadges> {
  if (!ctx || !user) return {};
  const reachable = new Set(
    entries.filter((entry) => entry.hasAccess).map((entry) => entry.fullId),
  );
  if (reachable.size === 0) return {};
  try {
    return await withResolverTimeout(
      ResolveNavBadges(ctx, user, reachable),
      "navigation badges",
    );
  } catch {
    return {};
  }
}

/** `entry` with its page's badge, unless it declares a static one. */
export function withNavBadge<T extends BadgedEntry>(
  entry: T,
  badges: NavBadges,
): T {
  const badge = badges[entry.fullId];
  return badge === undefined || entry.badge !== undefined
    ? entry
    : { ...entry, badge };
}

/** The menu tree with each page's badge, at every level. */
export function withTreeNavBadges<T extends BadgedTree>(
  node: T,
  badges: NavBadges,
): T {
  const children = Object.fromEntries(
    Object.entries(node.children).map(([key, child]) => [
      key,
      withTreeNavBadges(child, badges),
    ]),
  );
  return { ...withNavBadge(node, badges), children };
}
