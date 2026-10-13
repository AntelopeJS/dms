import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockActionsOption,
  blockCardOption,
  type BlockItemsSource,
  blockItemsSourceOptions,
  type BlockLinkAction,
} from "./display";
import { toneEnum } from "./internal/display";
import {
  blockTextSchema,
  composedTextParamSchema,
} from "./internal/composed-text";
import type { BaseComponentProps } from "./types";
import type { BlockText, ComposedTextParam } from "./types/composed-text";
import { type Tone, TONES } from "./types/tone";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";

/** One entry of an activity feed. */
export interface ActivityFeedItem {
  id?: string;
  /** Icon of the entry's well, e.g. `i-ph-check-circle`. */
  icon?: string;
  tone?: Tone;
  /**
   * Title: a literal, a `$`-prefixed i18n key, or a `ComposedText` that
   * carries its own values.
   */
  title: BlockText;
  /** Details under the title, joined by "·"; each one like the title. */
  meta?: BlockText[];
  /**
   * A third line under the details, dimmed and mono, like the title: the
   * evidence behind the entry (`400 "Cart is empty" × 16`).
   */
  detail?: BlockText;
  /**
   * Values the `$`-prefixed title and details interpolate (`{device}`). A
   * typed value is formatted for the reader (`{ type: "count", value: 3 }`,
   * which also picks the plural form of the message; `{ type: "relative",
   * value: "2026-10-10T08:00:00Z" }`), as in a `ComposedText`. A string
   * written as a `$`-prefixed key is translated first, with the item's other
   * values: `{ device: "$…device", browser: "Chrome", os: "Windows" }`.
   */
  params?: Record<string, ComposedTextParam>;
  /** ISO date: files the entry under its day and gives its time. */
  date?: string;
  /** Trailing text, in place of the formatted time; a `BlockText`. */
  time?: BlockText;
  /** Accent dot after the time. */
  unread?: boolean;
  /**
   * Path the entry links to. Takes the page URL tokens (`{{params.X}}`,
   * `{{query.X}}`).
   */
  to?: string;
}

/**
 * What an `ActivityFeed`'s `fetchUrl` answers: its entries, newest first, and
 * optionally how many there are in all, shown beside the title.
 */
export interface ActivityFeedResponse {
  items: ActivityFeedItem[];
  /**
   * The count beside the title: every entry the source holds, more than
   * `items` when the route caps them. Replaces the `count` option.
   */
  count?: number;
}

/**
 * The options `ActivityFeed` takes. Its `fetchUrl` answers `{ items }`, newest
 * first, like every list block, and may add a `count`
 * (`ActivityFeedResponse`).
 */
export interface ActivityFeedProps
  extends BaseComponentProps, BlockItemsSource {
  /** Eyebrow title of the card head. */
  title?: string;
  /**
   * Count beside the title, as a mono chip. A `count` the route answers
   * replaces it. Shown with the card head only.
   */
  count?: number;
  /**
   * Soft badge in the card head, before the actions, like a `TopListCard`'s
   * period badge: the window the entries cover ("Last 24 h"). A `$` key, a
   * literal or a `ComposedText`. Shown with the card head only.
   */
  badge?: BlockText;
  /** Entries shown when no data source is set, newest first. */
  items?: ActivityFeedItem[];
  /**
   * Files the entries under day separators ("Today · Sep 29") with their time.
   * Off, each entry says how long ago it happened. Defaults to `true`.
   */
  groupByDay?: boolean;
  /** Shows at most this many entries; `skeletonCount` never exceeds it. */
  maxItems?: number;
  /**
   * Shows the first this many entries and, under them, a "Show N more"
   * button that unfolds the rest (up to `maxItems`) and folds them back:
   * the card stays short without hiding what it holds.
   */
  visibleItems?: number;
  /**
   * Entries wrap their title, details and detail line over as many lines as
   * they need, a long path breaking anywhere, instead of cutting each to one
   * line with an ellipsis. Defaults to `false`.
   */
  wrap?: boolean;
  /**
   * The card fills its grid cell instead of growing with its entries, which
   * scroll inside it under a fixed head: the cards beside it in the row set
   * the row's height. Once the cells stack, the list scrolls past a height
   * of its own. Defaults to `false`.
   */
  fillHeight?: boolean;
  /** Link buttons in the card head ("View all"). */
  actions?: BlockLinkAction[];
  /** Mono titles and details (paths, queries, request logs). */
  mono?: boolean;
  /** Card frame with a head. Defaults to `true`. */
  card?: boolean;
}

const ACTIVITY_FEED_COMPONENT_NAME = "dms-activity-feed-block";
const DEFAULT_ICON = "i-ph-pulse";

/**
 * ActivityFeed - a feed of events, grouped by day.
 *
 * Static entries or a data source; each entry has a tinted icon well, a title,
 * dimmed details and its time. Shows a skeleton while loading, an empty state
 * and a retry on error.
 *
 * @example
 * ```typescript
 * ActivityFeed({
 *   title: "Activity",
 *   fetchUrl: "/api/activity",
 *   maxItems: 8,
 *   actions: [{ label: "View all", to: "/audit" }],
 * })
 *
 * // Head: "NEEDS ATTENTION [4]  Last 24 h"; each entry a third mono line,
 * // wrapped rather than cut, three shown before "Show 1 more".
 * ActivityFeed({
 *   title: "Needs attention",
 *   badge: "Last 24 h",
 *   fetchUrl: "/api/attention", // { items: [{ …, detail }], count: 4 }
 *   groupByDay: false,
 *   wrap: true,
 *   visibleItems: 3,
 * })
 * ```
 */
export function ActivityFeed(
  options?: ActivityFeedProps,
): ComponentBuilder<ActivityFeedProps> {
  return attachRealtimeTopicsHook(
    new ComponentBuilder<ActivityFeedProps>(ACTIVITY_FEED_COMPONENT_NAME)
      .options({ ...options })
      .meta({
        name: options?.title || "Activity feed",
        icon: DEFAULT_ICON,
      }),
    options?.realtimeTopic,
  );
}

const ActivityFeedItemSchema = z.object({
  id: z.string().optional(),
  icon: ui(z.string().optional(), { label: "Icon", widget: "icon" }),
  tone: ui(toneEnum(TONES).optional(), {
    label: "Tone",
    widget: "select",
  }),
  title: ui(blockTextSchema(), { label: "Title", widget: "text" }),
  meta: ui(z.array(blockTextSchema()).optional(), { label: "Details" }),
  detail: ui(blockTextSchema().optional(), {
    label: "Detail line",
    widget: "text",
  }),
  params: ui(z.record(z.string(), composedTextParamSchema()).optional(), {
    label: "Text values",
    widget: "json",
  }),
  date: ui(z.string().optional().describe("ISO date of the event."), {
    label: "Date",
  }),
  time: ui(blockTextSchema().optional(), {
    label: "Time text",
    widget: "text",
  }),
  unread: ui(z.boolean().optional(), { label: "Unread", widget: "switch" }),
  to: ui(z.string().optional(), { label: "Link", widget: "url" }),
}) satisfies BlockOptionsFor<ActivityFeedItem>;

/** The options `ActivityFeed` accepts. */
export const ActivityFeedSchema = z.object({
  title: ui(z.string().optional().describe("Eyebrow title of the card."), {
    label: "Title",
    group: "content",
  }),
  items: ui(z.array(ActivityFeedItemSchema).optional(), {
    label: "Static entries",
    group: "content",
    widget: "json",
  }),
  count: ui(
    z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Count beside the title; a `count` the route answers wins."),
    { label: "Count", group: "content", widget: "number", min: 0 },
  ),
  badge: ui(
    blockTextSchema()
      .optional()
      .describe("Soft badge in the card head, e.g. the window covered."),
    { label: "Badge", group: "content", widget: "text" },
  ),
  groupByDay: ui(
    z
      .boolean()
      .optional()
      .describe("Day separators with times, rather than relative times."),
    {
      label: "Group by day",
      group: "appearance",
      widget: "switch",
      initial: true,
    },
  ),
  maxItems: ui(z.number().int().optional(), {
    label: "Maximum entries",
    group: "appearance",
    widget: "number",
    min: 1,
  }),
  visibleItems: ui(
    z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Entries shown before a "Show N more" button unfolds the rest.',
      ),
    {
      label: "Entries before Show more",
      group: "appearance",
      widget: "number",
      min: 1,
    },
  ),
  wrap: ui(
    z
      .boolean()
      .optional()
      .describe(
        "Entries wrap their texts rather than cutting them to one line.",
      ),
    { label: "Wrap entries", group: "appearance", widget: "switch" },
  ),
  fillHeight: ui(
    z
      .boolean()
      .optional()
      .describe(
        "Fills the grid cell, the entries scrolling inside, rather than growing with them.",
      ),
    { label: "Fill the cell", group: "appearance", widget: "switch" },
  ),
  actions: blockActionsOption("Link buttons in the card head."),
  ...blockItemsSourceOptions(),
  mono: ui(z.boolean().optional(), {
    label: "Mono text",
    group: "appearance",
    widget: "switch",
  }),
  card: blockCardOption(true),
}) satisfies BlockOptionsFor<ActivityFeedProps>;

RegisterBlockType({
  type: "ActivityFeed",
  componentName: ACTIVITY_FEED_COMPONENT_NAME,
  schema: ActivityFeedSchema,
  meta: {
    name: "Activity feed",
    icon: DEFAULT_ICON,
    description: "Recent events, grouped by day, from a list or a source.",
    group: "data",
  },
});
