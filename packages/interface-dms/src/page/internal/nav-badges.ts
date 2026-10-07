import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { User } from "../../auth/db";
import type { Component, NavBadgeSource } from "../../component";
import { getDeclaredComponentChildren } from "./component-target";
import { PageMetadata } from "../metadata";
import { pageMetadataByFullId } from "./registry";

/**
 * Page full id → the navigation badge shown next to its entry.
 *
 * @internal
 */
export type NavBadges = Record<string, string>;

interface PublishedNavBadge {
  pageFullId: string;
  source: NavBadgeSource;
}

/** A component and everything it nests, each once. */
function componentsUnder(root: Component): Component[] {
  const seen = new Set<Component>();
  const walk = (component: Component): void => {
    if (seen.has(component)) return;
    seen.add(component);
    for (const child of getDeclaredComponentChildren(component)) {
      walk(child.component);
    }
  };
  walk(root);
  return [...seen];
}

function targetPageFullId(
  source: NavBadgeSource,
  ownPageFullId: string,
): string | undefined {
  if (!source.page) return ownPageFullId;
  return GetMetadata(source.page, PageMetadata).pageInfo?.fullId;
}

/** Every badge the registered pages publish, the first one for a page. */
function publishedNavBadges(pageFullIds: Set<string>): PublishedNavBadge[] {
  const published = new Map<string, PublishedNavBadge>();
  for (const [ownPageFullId, meta] of pageMetadataByFullId) {
    const sources = Object.values(meta.components)
      .flatMap(componentsUnder)
      .flatMap((component) => component.navBadgeSources ?? []);
    for (const source of sources) {
      const pageFullId = targetPageFullId(source, ownPageFullId);
      if (!pageFullId || !pageFullIds.has(pageFullId)) continue;
      if (!published.has(pageFullId)) {
        published.set(pageFullId, { pageFullId, source });
      }
    }
  }
  return [...published.values()];
}

/**
 * The navigation badges of the pages `pageFullIds` — those the caller can
 * open — for the caller of `ctx`: a table view tab declared with `navBadge`
 * publishes its counter for its page. A count the caller may not read, one
 * that fails, and a count of zero show no badge.
 *
 * @internal Called by the DMS when it serves the menu.
 */
export async function ResolveNavBadges(
  ctx: RequestContext,
  user: User,
  pageFullIds: Set<string>,
): Promise<NavBadges> {
  const counted = await Promise.allSettled(
    publishedNavBadges(pageFullIds).map(async ({ pageFullId, source }) => {
      const count = await source.count(ctx, user);
      return [pageFullId, count] as const;
    }),
  );
  const badges: NavBadges = {};
  for (const result of counted) {
    if (result.status !== "fulfilled") continue;
    const [pageFullId, count] = result.value;
    if (count > 0) badges[pageFullId] = String(count);
  }
  return badges;
}
