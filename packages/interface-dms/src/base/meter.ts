import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockActionsOption,
  blockCardOption,
  blockFetchUrlMethodOption,
  blockFetchUrlOption,
  type BlockLinkAction,
} from "./display";
import { toneEnum } from "./internal/display";
import type { BaseComponentProps, EnumOption } from "./types";
import type { HttpMethod } from "./types/http";
import { TONES } from "./types/tone";

/**
 * Fill tones of a meter: the semantic tones plus `soft`, the pale primary of
 * what is pending or reserved.
 */
export const METER_TONES = [...TONES, "soft"] as const;
export type MeterTone = (typeof METER_TONES)[number];

/** Value text right of the label: `8 / 10`, `80%`, `8` or none. */
export const METER_FORMATS = ["fraction", "percent", "value", "none"] as const;
export type MeterFormat = (typeof METER_FORMATS)[number];

/** Bar height: `xs` 4px, `sm` 6px, `md` 8px. */
export const METER_SIZES = ["xs", "sm", "md"] as const;
export type MeterSize = (typeof METER_SIZES)[number];

/** One stacked fill of a meter. */
export interface MeterSegment {
  value: number;
  tone?: MeterTone;
  /** Legend text ("6 members"). */
  label?: string;
}

/** The options `Meter` takes. */
export interface MeterProps extends BaseComponentProps {
  /** Name of the measure ("Seats"). */
  label?: string;
  /** Dimmed note after the label ("8 in use · 2 free"). */
  hint?: string;
  /** Filled amount; ignored when `segments` is set. */
  value?: number;
  /** Total the bar stands for. Defaults to 100. */
  max?: number;
  /** Stacked fills, drawn in order. */
  segments?: MeterSegment[];
  /** Shows the segment labels under the bar. */
  legend?: boolean;
  /** Value text right of the label. Defaults to `fraction`. */
  format?: MeterFormat;
  /** Replaces the formatted value text. */
  valueLabel?: string;
  /** Fill tone of a single value. Defaults to `primary`. */
  tone?: MeterTone;
  /** Percent of `max` from which the fill turns warning. */
  warnAt?: number;
  /** Percent of `max` from which the fill turns error. */
  errorAt?: number;
  size?: MeterSize;
  /**
   * Endpoint answering an object with any of `{ value, max, segments, hint,
   * valueLabel }`, for figures that change per request (seats used, quota
   * left). A meter is one measure, so unlike the list blocks it reads an
   * object rather than `{ items }`. `{{params.X}}` and `{{query.X}}` name
   * the page URL, as in `BlockItemsSource.fetchUrl`.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Wraps the meter in a padded card. Defaults to `false`. */
  card?: boolean;
  /** Link buttons under the bar, on the right ("Manage members"). */
  actions?: BlockLinkAction[];
}

const METER_COMPONENT_NAME = "dms-meter-block";
const DEFAULT_ICON = "i-ph-gauge";

/**
 * Meter - an "x of y" bar: seats, quotas, storage, coverage.
 *
 * One value or stacked segments with a legend, the value as a fraction or a
 * percentage, and thresholds turning the bar warning or error.
 *
 * @example
 * ```typescript
 * Meter({
 *   label: "Seats",
 *   max: 10,
 *   segments: [
 *     { value: 6, label: "6 members" },
 *     { value: 2, tone: "soft", label: "2 pending invites" },
 *   ],
 *   legend: true,
 *   warnAt: 80,
 * })
 * ```
 */
export function Meter(options?: MeterProps): ComponentBuilder<MeterProps> {
  return new ComponentBuilder<MeterProps>(METER_COMPONENT_NAME)
    .options({ ...options })
    .meta({
      name: options?.label || "Meter",
      icon: DEFAULT_ICON,
    });
}

const MeterSegmentSchema = z.object({
  value: ui(z.number(), { label: "Value", widget: "number" }),
  tone: ui(toneEnum(METER_TONES).optional(), {
    label: "Tone",
    widget: "select",
  }),
  label: ui(z.string().optional(), { label: "Legend" }),
}) satisfies BlockOptionsFor<MeterSegment>;

/** The options `Meter` accepts. */
export const MeterSchema = z.object({
  label: ui(z.string().optional().describe("Name of the measure."), {
    label: "Label",
    group: "content",
  }),
  hint: ui(z.string().optional(), { label: "Hint", group: "content" }),
  value: ui(z.number().optional().describe("Filled amount."), {
    label: "Value",
    group: "data",
    widget: "number",
  }),
  max: ui(z.number().optional().describe("Total the bar stands for."), {
    label: "Maximum",
    group: "data",
    widget: "number",
    min: 0,
  }),
  segments: ui(z.array(MeterSegmentSchema).optional(), {
    label: "Segments",
    group: "data",
  }),
  legend: ui(z.boolean().optional(), {
    label: "Show legend",
    group: "appearance",
    widget: "switch",
  }),
  format: ui(z.enum(METER_FORMATS).optional(), {
    label: "Value text",
    group: "appearance",
    widget: "segmented",
  }),
  valueLabel: ui(z.string().optional(), {
    label: "Custom value text",
    group: "content",
  }),
  tone: ui(toneEnum(METER_TONES).optional(), {
    label: "Tone",
    group: "appearance",
    widget: "select",
  }),
  warnAt: ui(z.number().optional().describe("Percent of the maximum."), {
    label: "Warning from",
    group: "behavior",
    widget: "number",
    min: 0,
    max: 100,
  }),
  errorAt: ui(z.number().optional().describe("Percent of the maximum."), {
    label: "Error from",
    group: "behavior",
    widget: "number",
    min: 0,
    max: 100,
  }),
  size: ui(z.enum(METER_SIZES).optional(), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  fetchUrl: blockFetchUrlOption("Where the figures come from."),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  card: blockCardOption(false),
  actions: blockActionsOption("Link buttons under the bar."),
}) satisfies BlockOptionsFor<MeterProps>;

RegisterBlockType({
  type: "Meter",
  componentName: METER_COMPONENT_NAME,
  schema: MeterSchema,
  meta: {
    name: "Meter",
    icon: DEFAULT_ICON,
    description: "An x-of-y bar for seats, quotas and coverage.",
    group: "visualization",
  },
});
