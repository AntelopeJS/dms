// The navigation badges the pages publish (a table view tab declared with
// `navBadge`), counted for the caller when the menu is served and written
// where a static `badge` would sit, in the tree and on the page entries. The
// tone rides next to the count (`badgeTone`), so a frontend that does not
// read it still shows the number.

import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  ResolveNavBadgeEntries,
  type ResolvedNavBadges,
} from "@antelopejs/interface-dms/page/internal/nav-badges";
import { withResolverTimeout } from "./resolver-timeout";

/** What the menu payload carries per entry, as far as the badges go. */
interface BadgedEntry {
  fullId: string;
  badge?: string;
  /** The tone of a counted badge; neutral when absent. */
  badgeTone?: Tone;
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
): Promise<ResolvedNavBadges> {
  if (!ctx || !user) return {};
  const reachable = new Set(
    entries.filter((entry) => entry.hasAccess).map((entry) => entry.fullId),
  );
  if (reachable.size === 0) return {};
  try {
    return await withResolverTimeout(
      ResolveNavBadgeEntries(ctx, user, reachable),
      "navigation badges",
    );
  } catch {
    return {};
  }
}

/** `entry` with its page's badge and tone, unless it declares a static one. */
export function withNavBadge<T extends BadgedEntry>(
  entry: T,
  badges: ResolvedNavBadges,
): T {
  const resolved = badges[entry.fullId];
  if (resolved === undefined || entry.badge !== undefined) return entry;
  const { badge, tone } = resolved;
  return tone ? { ...entry, badge, badgeTone: tone } : { ...entry, badge };
}

/** The menu tree with each page's badge, at every level. */
export function withTreeNavBadges<T extends BadgedTree>(
  node: T,
  badges: ResolvedNavBadges,
): T {
  const children = Object.fromEntries(
    Object.entries(node.children).map(([key, child]) => [
      key,
      withTreeNavBadges(child, badges),
    ]),
  );
  return { ...withNavBadge(node, badges), children };
}
