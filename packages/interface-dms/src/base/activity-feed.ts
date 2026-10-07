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
import type { BaseComponentProps } from "./types";
import { type Tone, TONES } from "./types/tone";

/** One entry of an activity feed. */
export interface ActivityFeedItem {
  id?: string;
  /** Icon of the entry's well, e.g. `i-ph-check-circle`. */
  icon?: string;
  tone?: Tone;
  /** Title (i18n key with `$` or literal). */
  title: string;
  /** Details under the title, joined by "·". */
  meta?: string[];
  /**
   * Values the title and the details interpolate (`{device}`) when they are
   * i18n keys. A value written as a `$`-prefixed key is translated first,
   * with the item's other values: `{ device: "$…device", browser: "Chrome",
   * os: "Windows" }`.
   */
  params?: Record<string, string>;
  /** ISO date: files the entry under its day and gives its time. */
  date?: string;
  /** Literal trailing text, in place of the formatted time. */
  time?: string;
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
  title: ui(z.string(), { label: "Title" }),
  meta: ui(z.array(z.string()).optional(), { label: "Details" }),
  params: ui(z.record(z.string(), z.string()).optional(), {
    label: "Text values",
    widget: "json",
  }),
  date: ui(z.string().optional().describe("ISO date of the event."), {
    label: "Date",
  }),
  time: ui(z.string().optional(), { label: "Time text" }),
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
