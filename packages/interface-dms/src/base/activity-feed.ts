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
  /** Path the entry links to. */
  to?: string;
}

/**
 * The options `ActivityFeed` takes. Its `fetchUrl` answers `{ items }`, newest
 * first, like every list block.
 */
export interface ActivityFeedProps
  extends BaseComponentProps, BlockItemsSource {
  /** Eyebrow title of the card head. */
  title?: string;
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
 * ```
 */
export function ActivityFeed(
  options?: ActivityFeedProps,
): ComponentBuilder<ActivityFeedProps> {
  return new ComponentBuilder<ActivityFeedProps>(ACTIVITY_FEED_COMPONENT_NAME)
    .options({ ...options })
    .meta({
      name: options?.title || "Activity feed",
      icon: DEFAULT_ICON,
    });
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
