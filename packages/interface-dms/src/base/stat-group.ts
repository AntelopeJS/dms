import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { type BlockItemsSource, blockItemsSourceOptions } from "./display";
import { toneEnum } from "./internal/display";
import { TONES, type Tone, ICON_TONES, type IconTone } from "./types/tone";
import { blockTextSchema } from "./internal/composed-text";
import type { BaseComponentProps } from "./types";
import type { BlockText } from "./types/composed-text";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";

/** One cell of a stat group. */
export interface StatGroupItem {
  /** Stable key; the position is used without one. */
  id?: string;
  /** Icon of the well; the cell has no well without one. */
  icon?: string;
  /**
   * Well tone. Defaults to `muted` in the joined layout, `primary` in the
   * cards layout.
   */
  tone?: IconTone;
  /**
   * Mono label above the value; `$`-prefixed for an i18n key, or a
   * `ComposedText`.
   */
  eyebrow: BlockText;
  /**
   * The figure or the short state; a number is formatted for the locale, and
   * a `ComposedText` composes an amount, a date or a count in the
   * reader's language (`{ key: "saas.stats.mrr", params: { amount: { type:
   * "money", value: 92200, currency: "EUR" } } }`).
   */
  value: BlockText | number;
  /** One line under the value: a string or a `ComposedText`. */
  detail?: BlockText;
  /** Tone of the detail line (`neutral` = muted). */
  detailTone?: Tone;
  /** Route, `#anchor` or URL the whole cell links to. */
  to?: string;
}

/** How a stat group lays its cells out: see `StatGroupProps.layout`. */
export const STAT_GROUP_LAYOUTS = ["joined", "cards"] as const;

export type StatGroupLayout = (typeof STAT_GROUP_LAYOUTS)[number];

/** The options `StatGroup` takes. */
export interface StatGroupProps extends BaseComponentProps, BlockItemsSource {
  items?: StatGroupItem[];
  /**
   * `joined`: one card split in cells by hairlines (security status strip).
   * `cards`: one compact stat card per item (modules summary).
   */
  layout?: StatGroupLayout;
  /** Columns on wide screens (1–6); defaults to the number of items. */
  columns?: number;
  /** Accessible name of the group. */
  label?: string;
}

const STAT_GROUP_COMPONENT_NAME = "dms-stat-group-block";
const STAT_GROUP_ICON = "i-ph-squares-four";
const STAT_GROUP_DEFAULT_LAYOUT: StatGroupLayout = "joined";

/**
 * StatGroup — a row of headline figures, each with its icon, a mono label, a
 * value and a detail line, optionally linking to where it is managed.
 *
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `StatGroup()`.
 *
 * @example
 * ```typescript
 * StatGroup({
 *   layout: "cards",
 *   items: [
 *     { icon: "i-ph-users", eyebrow: "Members", value: 8, detail: "2 pending" },
 *     { icon: "i-ph-warning", tone: "warning", eyebrow: "Overdue", value: 3 },
 *   ],
 * })
 * ```
 */
export function StatGroup(
  options?: StatGroupProps,
): ComponentBuilder<StatGroupProps> {
  return attachRealtimeTopicsHook(
    new ComponentBuilder<StatGroupProps>(STAT_GROUP_COMPONENT_NAME)
      .options({ layout: STAT_GROUP_DEFAULT_LAYOUT, ...options })
      .meta({ name: "Stat group", icon: STAT_GROUP_ICON }),
    options?.realtimeTopic,
  );
}

const StatGroupItemSchema = z.object({
  id: ui(z.string().optional(), { label: "Key", advanced: true }),
  icon: ui(z.string().optional(), { label: "Icon", widget: "icon" }),
  tone: ui(toneEnum(ICON_TONES).optional(), {
    label: "Tone",
    widget: "select",
  }),
  eyebrow: ui(blockTextSchema().describe("Mono label above the value."), {
    label: "Label",
    widget: "text",
  }),
  value: ui(
    z
      .union([blockTextSchema(), z.number()])
      .describe("The figure or the state."),
    { label: "Value", widget: "text" },
  ),
  detail: ui(blockTextSchema().optional(), { label: "Detail", widget: "text" }),
  detailTone: ui(toneEnum(TONES).optional(), {
    label: "Detail tone",
    widget: "select",
  }),
  to: ui(z.string().optional().describe("Route, `#anchor` or URL."), {
    label: "Link",
    widget: "url",
  }),
}) satisfies BlockOptionsFor<StatGroupItem>;

/** The options `StatGroup` accepts. */
export const StatGroupSchema = z.object({
  items: ui(
    z.array(StatGroupItemSchema).optional().describe("The cells, in order."),
    { label: "Cells", group: "content" },
  ),
  layout: ui(
    z
      .enum(STAT_GROUP_LAYOUTS)
      .default(STAT_GROUP_DEFAULT_LAYOUT)
      .describe("One card split in cells, or one card per cell."),
    {
      label: "Layout",
      group: "appearance",
      widget: "segmented",
      valueLabels: { joined: "Joined", cards: "Cards" },
    },
  ),
  columns: ui(
    z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe("Columns on wide screens; defaults to the number of cells."),
    { label: "Columns", group: "layout", widget: "number", min: 1, max: 6 },
  ),
  label: ui(z.string().optional().describe("Accessible name of the group."), {
    label: "Accessible name",
    group: "advanced",
  }),
  ...blockItemsSourceOptions(),
}) satisfies BlockOptionsFor<StatGroupProps>;

RegisterBlockType({
  type: "StatGroup",
  componentName: STAT_GROUP_COMPONENT_NAME,
  schema: StatGroupSchema,
  meta: {
    name: "Stat group",
    icon: STAT_GROUP_ICON,
    description:
      "Several figures or states at a glance, joined in one card or as cards.",
    group: "visualization",
  },
});
