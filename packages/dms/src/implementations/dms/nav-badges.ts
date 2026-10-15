// The navigation badges the pages publish (a table view tab declared with
// `navBadge`), counted for the caller on each page visit and served next to
// the page (`navBadges`), never in the site layout a browser keeps for
// minutes: a count read once would stay on screen that long.

import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  ResolveNavBadgeEntries,
  type ResolvedNavBadges,
} from "@antelopejs/interface-dms/page/internal/nav-badges";
import { withResolverTimeout } from "./resolver-timeout";

/** A page entry, as far as counting its badge goes. */
interface BadgedEntry {
  fullId: string;
  hasAccess?: boolean;
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
