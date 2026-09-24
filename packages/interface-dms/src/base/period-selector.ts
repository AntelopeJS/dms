import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types";
import { SIZES } from "./types/size";

/** Every date range the selector can offer. */
export const PERIOD_PRESETS = [
  "last-hour",
  "last-24h",
  "today",
  "yesterday",
  "last-7-days",
  "last-30-days",
  "last-90-days",
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "ytd",
  "last-year",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** Every comparison the selector can offer. */
export const PERIOD_COMPARISONS = [
  "none",
  "previous-period",
  "previous-year",
  "custom",
] as const;
export type PeriodComparison = (typeof PERIOD_COMPARISONS)[number];

/** Where the selector sits in its row. */
export const PERIOD_ALIGNS = ["left", "center", "right"] as const;
export type PeriodAlign = (typeof PERIOD_ALIGNS)[number];

/** How the selector renders its presets. */
export const PERIOD_SELECTOR_VARIANTS = ["default", "segmented"] as const;
export type PeriodSelectorVariant = (typeof PERIOD_SELECTOR_VARIANTS)[number];

/**
 * The scope a selector drives when nothing else is named: the one a builder
 * binds a card's period to. One selector per page needs no other.
 */
export const DEFAULT_PERIOD_SCOPE = "page";

export interface PeriodSelectorProps extends BaseComponentProps {
  /** Scope id the cards on the page refer to. Defaults to {@link DEFAULT_PERIOD_SCOPE}. */
  id?: string;
  defaultPreset?: PeriodPreset;
  defaultComparison?: PeriodComparison;
  presets?: PeriodPreset[];
  comparisons?: PeriodComparison[];
  presetLabels?: Partial<Record<PeriodPreset, string>>;
  comparisonLabels?: Partial<Record<PeriodComparison, string>>;
  align?: PeriodAlign;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showRangeLabel?: boolean;
  /**
   * `segmented` renders the presets as inline pills for one-click range
   * switching; the custom range stays in its popover calendar.
   */
  variant?: PeriodSelectorVariant;
}

const PERIOD_SELECTOR_COMPONENT_NAME = "dms-period-selector";

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `PeriodSelector()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 */
export function PeriodSelector(
  options?: PeriodSelectorProps,
): ComponentBuilder<PeriodSelectorProps> {
  return new ComponentBuilder<PeriodSelectorProps>(
    PERIOD_SELECTOR_COMPONENT_NAME,
  )
    .options({ ...options, id: options?.id ?? DEFAULT_PERIOD_SCOPE })
    .meta({
      name: "PeriodSelector",
      icon: "i-ph-calendar",
    });
}

/**
 * What an editor calls each range and each comparison. The same words the
 * selector shows in English, so an author sees the entry they are relabelling.
 */
const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  "last-hour": "Last hour",
  "last-24h": "Last 24 hours",
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "last-90-days": "Last 90 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  ytd: "Year to date",
  "last-year": "Last year",
  custom: "Custom",
};
const PERIOD_COMPARISON_LABELS: Record<PeriodComparison, string> = {
  none: "No comparison",
  "previous-period": "vs previous period",
  "previous-year": "vs previous year",
  custom: "Custom",
};

const presetSchema = ui(z.enum(PERIOD_PRESETS), {
  valueLabels: PERIOD_PRESET_LABELS,
});
const comparisonSchema = ui(z.enum(PERIOD_COMPARISONS), {
  valueLabels: PERIOD_COMPARISON_LABELS,
});

/** The options `PeriodSelector` accepts. */
export const PeriodSelectorSchema = z.object({
  // A card bound to a period follows the page's scope, so a selector seeded
  // with an id of its own drove no card at all — and said nothing.
  id: ui(
    z
      .string()
      .default(DEFAULT_PERIOD_SCOPE)
      .describe("Scope id the cards on the page refer to."),
    { label: "Scope id", group: "advanced" },
  ),
  defaultPreset: ui(presetSchema.optional(), {
    label: "Default range",
    group: "behavior",
    widget: "select",
  }),
  defaultComparison: ui(comparisonSchema.optional(), {
    label: "Default comparison",
    group: "behavior",
    widget: "select",
  }),
  presets: ui(z.array(presetSchema).optional().describe("Ranges offered."), {
    label: "Available ranges",
    group: "behavior",
  }),
  comparisons: ui(z.array(comparisonSchema).optional(), {
    label: "Available comparisons",
    group: "behavior",
  }),
  // Keyed by a closed set, so an editor lists one entry per range to relabel
  // rather than asking for an object typed by hand.
  presetLabels: ui(z.record(presetSchema, z.string()).optional(), {
    label: "Range labels",
    group: "content",
  }),
  comparisonLabels: ui(z.record(comparisonSchema, z.string()).optional(), {
    label: "Comparison labels",
    group: "content",
  }),
  align: ui(z.enum(PERIOD_ALIGNS).optional(), {
    label: "Alignment",
    group: "appearance",
    widget: "segmented",
  }),
  size: ui(z.enum(SIZES).optional(), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  showRangeLabel: ui(z.boolean().optional(), {
    label: "Show the range",
    group: "appearance",
    widget: "switch",
  }),
  variant: ui(
    z
      .enum(PERIOD_SELECTOR_VARIANTS)
      .optional()
      .describe("`segmented` shows the ranges as inline pills."),
    { label: "Variant", group: "appearance", widget: "segmented" },
  ),
}) satisfies BlockOptionsFor<PeriodSelectorProps>;

RegisterBlockType({
  type: "PeriodSelector",
  componentName: PERIOD_SELECTOR_COMPONENT_NAME,
  schema: PeriodSelectorSchema,
  meta: {
    name: "Period selector",
    icon: "i-ph-calendar",
    description: "Date range picker driving the cards that share its scope.",
    group: "data",
  },
});
