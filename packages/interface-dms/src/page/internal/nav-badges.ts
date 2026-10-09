import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { User } from "../../auth/db";
import type { Component, NavBadgeCount, NavBadgeSource } from "../../component";
import type { Tone } from "../../base/types/tone";
import { getDeclaredComponentChildren } from "./component-target";
import { PageMetadata } from "../metadata";
import { pageMetadataByFullId } from "./registry";

/**
 * Page full id → the navigation badge shown next to its entry.
 *
 * @internal
 */
export type NavBadges = Record<string, string>;

/**
 * A page's navigation badge as the menu serves it: the label, and its tone
 * when it is not neutral.
 *
 * @internal
 */
export interface ResolvedNavBadge {
  badge: string;
  tone?: Tone;
}

/**
 * Page full id → its navigation badge and tone.
 *
 * @internal
 */
export type ResolvedNavBadges = Record<string, ResolvedNavBadge>;

/**
 * The tones a navigation badge takes, strongest first: an immediate risk, a
 * thing to check, an action available, good news, then plain information.
 * Several counts on one badge take the strongest of their tones.
 *
 * @internal
 */
export const NAV_BADGE_TONE_ORDER: readonly Tone[] = [
  "error",
  "warning",
  "primary",
  "secondary",
  "success",
  "info",
  "neutral",
];

/**
 * The strongest of `tones` (see {@link NAV_BADGE_TONE_ORDER}); undefined when
 * none is given.
 *
 * @internal
 */
export function strongestNavBadgeTone(
  tones: Iterable<Tone | undefined>,
): Tone | undefined {
  const given = new Set(tones);
  return NAV_BADGE_TONE_ORDER.find((tone) => given.has(tone));
}

/**
 * One badge for several counts: they add up, in the strongest tone of those
 * that count something.
 *
 * @internal
 */
export function combineNavBadgeCounts(
  values: Array<number | NavBadgeCount>,
): NavBadgeCount {
  const counts = values.map((value) =>
    typeof value === "number" ? { count: value } : value,
  );
  const nonZero = counts.filter(({ count }) => count > 0);
  const tone = strongestNavBadgeTone(nonZero.map(({ tone }) => tone));
  const count = nonZero.reduce((sum, value) => sum + value.count, 0);
  return tone ? { count, tone } : { count };
}

const NEUTRAL_TONE: Tone = "neutral";

interface PublishedNavBadge {
  pageFullId: string;
  sources: NavBadgeSource[];
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

/** Every badge the registered pages publish, with all the counts for a page. */
function publishedNavBadges(pageFullIds: Set<string>): PublishedNavBadge[] {
  const published = new Map<string, PublishedNavBadge>();
  for (const [ownPageFullId, meta] of pageMetadataByFullId) {
    const sources = Object.values(meta.components)
      .flatMap(componentsUnder)
      .flatMap((component) => component.navBadgeSources ?? []);
    for (const source of sources) {
      const pageFullId = targetPageFullId(source, ownPageFullId);
      if (!pageFullId || !pageFullIds.has(pageFullId)) continue;
      const entry = published.get(pageFullId) ?? { pageFullId, sources: [] };
      entry.sources.push(source);
      published.set(pageFullId, entry);
    }
  }
  return [...published.values()];
}

/** The counts of `sources` the caller may read; one that throws counts none. */
async function countSources(
  sources: NavBadgeSource[],
  ctx: RequestContext,
  user: User,
): Promise<NavBadgeCount> {
  const counted = await Promise.allSettled(
    sources.map((source) => source.count(ctx, user)),
  );
  return combineNavBadgeCounts(
    counted.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
  );
}

/**
 * The navigation badges of the pages `pageFullIds` — those the caller can
 * open — for the caller of `ctx`, with their tones: a table view tab declared
 * with `navBadge` publishes its counter for its page. A count the caller may
 * not read, one that fails, and a count of zero show no badge; the counts a
 * page receives from several components add up, in the strongest tone.
 *
 * @internal Called by the DMS when it serves the menu.
 */
export async function ResolveNavBadgeEntries(
  ctx: RequestContext,
  user: User,
  pageFullIds: Set<string>,
): Promise<ResolvedNavBadges> {
  const counted = await Promise.all(
    publishedNavBadges(pageFullIds).map(async ({ pageFullId, sources }) => {
      const { count, tone } = await countSources(sources, ctx, user);
      return { pageFullId, count, tone };
    }),
  );
  const badges: ResolvedNavBadges = {};
  for (const { pageFullId, count, tone } of counted) {
    if (count <= 0) continue;
    const badge = String(count);
    badges[pageFullId] =
      tone && tone !== NEUTRAL_TONE ? { badge, tone } : { badge };
  }
  return badges;
}

/**
 * {@link ResolveNavBadgeEntries} without the tones.
 *
 * @internal Kept for a DMS built before the badges carried a tone.
 */
export async function ResolveNavBadges(
  ctx: RequestContext,
  user: User,
  pageFullIds: Set<string>,
): Promise<NavBadges> {
  const entries = await ResolveNavBadgeEntries(ctx, user, pageFullIds);
  return Object.fromEntries(
    Object.entries(entries).map(([pageFullId, { badge }]) => [
      pageFullId,
      badge,
    ]),
  );
}
