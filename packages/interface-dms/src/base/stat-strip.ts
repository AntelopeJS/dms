import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  type BlockItemsSource,
  blockItemsSourceOptions,
  DISPLAY_TONES,
  type DisplayTone,
  ICON_TONES,
  type IconTone,
} from "./display";
import type { BaseComponentProps } from "./types";

/** One cell of a stat strip. */
export interface StatStripItem {
  /** Stable key; the position is used without one. */
  id?: string;
  /** Icon of the well; the cell has no well without one. */
  icon?: string;
  /**
   * Well tone. Defaults to `muted` in the joined layout, `primary` in the
   * cards layout.
   */
  tone?: IconTone;
  /** Mono label above the value; `$`-prefixed for an i18n key. */
  eyebrow: string;
  /** The figure or the short state; a number is formatted for the locale. */
  value: string | number;
  /** One line under the value. */
  detail?: string;
  /** Tone of the detail line (`neutral` = muted). */
  detailTone?: DisplayTone;
  /** Route, `#anchor` or URL the whole cell links to. */
  href?: string;
}

export const STAT_STRIP_LAYOUTS = ["joined", "cards"] as const;

export type StatStripLayout = (typeof STAT_STRIP_LAYOUTS)[number];

export interface StatStripProps extends BaseComponentProps, BlockItemsSource {
  items?: StatStripItem[];
  /**
   * `joined`: one card split in cells by hairlines (security status strip).
   * `cards`: one compact stat card per item (modules summary).
   */
  layout?: StatStripLayout;
  /** Columns on wide screens (1–6); defaults to the number of items. */
  columns?: number;
  /** Accessible name of the strip. */
  label?: string;
}

const STAT_STRIP_COMPONENT_NAME = "dms-stat-strip-block";
const STAT_STRIP_ICON = "i-ph-squares-four";
const STAT_STRIP_DEFAULT_LAYOUT: StatStripLayout = "joined";

/**
 * StatStrip — a row of headline figures, each with its icon, a mono label, a
 * value and a detail line, optionally linking to where it is managed.
 *
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `StatStrip()`.
 *
 * @example
 * ```typescript
 * StatStrip({
 *   layout: "cards",
 *   items: [
 *     { icon: "i-ph-users", eyebrow: "Members", value: 8, detail: "2 pending" },
 *     { icon: "i-ph-warning", tone: "warning", eyebrow: "Overdue", value: 3 },
 *   ],
 * })
 * ```
 */
export function StatStrip(
  options?: StatStripProps,
): ComponentBuilder<StatStripProps> {
  return new ComponentBuilder<StatStripProps>(STAT_STRIP_COMPONENT_NAME)
    .options({ layout: STAT_STRIP_DEFAULT_LAYOUT, ...options })
    .meta({ name: "Stat strip", icon: STAT_STRIP_ICON });
}

const StatStripItemSchema = z.object({
  id: ui(z.string().optional(), { label: "Key", advanced: true }),
  icon: ui(z.string().optional(), { label: "Icon", widget: "icon" }),
  tone: ui(z.enum(ICON_TONES).optional(), { label: "Tone", widget: "select" }),
  eyebrow: ui(z.string().describe("Mono label above the value."), {
    label: "Label",
  }),
  value: ui(
    z.union([z.string(), z.number()]).describe("The figure or the state."),
    { label: "Value" },
  ),
  detail: ui(z.string().optional(), { label: "Detail" }),
  detailTone: ui(z.enum(DISPLAY_TONES).optional(), {
    label: "Detail tone",
    widget: "select",
  }),
  href: ui(z.string().optional().describe("Route, `#anchor` or URL."), {
    label: "Link",
    widget: "url",
  }),
}) satisfies BlockOptionsFor<StatStripItem>;

/** The options `StatStrip` accepts. */
export const StatStripSchema = z.object({
  items: ui(
    z.array(StatStripItemSchema).optional().describe("The cells, in order."),
    { label: "Cells", group: "content" },
  ),
  layout: ui(
    z
      .enum(STAT_STRIP_LAYOUTS)
      .default(STAT_STRIP_DEFAULT_LAYOUT)
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
  label: ui(z.string().optional().describe("Accessible name of the strip."), {
    label: "Accessible name",
    group: "advanced",
  }),
  ...blockItemsSourceOptions(),
}) satisfies BlockOptionsFor<StatStripProps>;

RegisterBlockType({
  type: "StatStrip",
  componentName: STAT_STRIP_COMPONENT_NAME,
  schema: StatStripSchema,
  meta: {
    name: "Stat strip",
    icon: STAT_STRIP_ICON,
    description: "Row of headline figures, joined in one card or as cards.",
    group: "visualization",
  },
});
