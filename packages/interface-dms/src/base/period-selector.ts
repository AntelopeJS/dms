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

export interface PeriodSelectorProps extends BaseComponentProps {
  id: string;
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

export function PeriodSelector(
  options: PeriodSelectorProps,
): ComponentBuilder<PeriodSelectorProps> {
  return new ComponentBuilder<PeriodSelectorProps>(
    PERIOD_SELECTOR_COMPONENT_NAME,
  )
    .options(options)
    .meta({
      name: "PeriodSelector",
      icon: "i-ph-calendar",
    });
}

/** The options `PeriodSelector` accepts. */
export const PeriodSelectorSchema = z.object({
  id: ui(z.string().describe("Scope id the cards on the page refer to."), {
    label: "Scope id",
    group: "data",
  }),
  defaultPreset: ui(z.enum(PERIOD_PRESETS).optional(), {
    label: "Default range",
    group: "behavior",
    widget: "select",
  }),
  defaultComparison: ui(z.enum(PERIOD_COMPARISONS).optional(), {
    label: "Default comparison",
    group: "behavior",
    widget: "select",
  }),
  presets: ui(
    z.array(z.enum(PERIOD_PRESETS)).optional().describe("Ranges offered."),
    { label: "Available ranges", group: "behavior" },
  ),
  comparisons: ui(z.array(z.enum(PERIOD_COMPARISONS)).optional(), {
    label: "Available comparisons",
    group: "behavior",
  }),
  presetLabels: ui(z.record(z.enum(PERIOD_PRESETS), z.string()).optional(), {
    label: "Range labels",
    group: "content",
    widget: "json",
  }),
  comparisonLabels: ui(
    z.record(z.enum(PERIOD_COMPARISONS), z.string()).optional(),
    {
      label: "Comparison labels",
      group: "content",
      widget: "json",
    },
  ),
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
