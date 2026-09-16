import { ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  narrowString,
  RegisterBlockType,
  ui,
} from "./block-registry";
import {
  type ChartColorValue,
  VALUE_FORMATS,
  type ValueFormat,
  type ValuePrecision,
} from "./chart";
import type { BaseComponentProps } from "./types";
import { HttpMethod } from "./types/http";

export interface KpiCardProps extends BaseComponentProps {
  title: string;
  /** "stat" = compact DMS look: mono uppercase label, bare icon. */
  variant?: "default" | "stat";
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: ChartColorValue | "auto";
  invert?: boolean;
  compareLabel?: string;
  staticValue?: number;
  staticDelta?: number;
  staticSparkline?: number[];
}

const KPI_CARD_COMPONENT_NAME = "dms-kpi-card";

export function KpiCard(options: KpiCardProps): ComponentBuilder<KpiCardProps> {
  return new ComponentBuilder<KpiCardProps>(KPI_CARD_COMPONENT_NAME)
    .options(options)
    .meta({
      name: options.title,
      icon: options.icon || "i-ph-trend-up",
    });
}

/** The options `KpiCard` accepts. */
export const KpiCardSchema = z.object({
  title: ui(z.string().describe("Card heading."), {
    label: "Title",
    group: "content",
  }),
  description: ui(
    z.string().optional().describe("Secondary line under the value."),
    { label: "Description", group: "content", widget: "textarea" },
  ),
  icon: ui(z.string().optional().describe("Icon name, e.g. `i-ph-trend-up`."), {
    label: "Icon",
    group: "appearance",
    widget: "icon",
  }),
  variant: ui(
    z
      .enum(["default", "stat"])
      .optional()
      .describe("`stat` renders the compact DMS look."),
    { label: "Variant", group: "appearance", widget: "segmented" },
  ),
  fetchUrl: ui(
    z.string().optional().describe("Endpoint the card reads its value from."),
    { label: "Data source", group: "data", widget: "query" },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "data",
    widget: "select",
  }),
  periodScope: ui(
    z
      .string()
      .optional()
      .describe("Id of the PeriodSelector driving this card."),
    { label: "Period scope", group: "data" },
  ),
  valueFormat: ui(z.enum(VALUE_FORMATS).optional(), {
    label: "Value format",
    group: "appearance",
    widget: "segmented",
  }),
  currencyCode: ui(
    z
      .string()
      .optional()
      .describe("ISO code used when the format is currency."),
    { label: "Currency", group: "appearance" },
  ),
  showDelta: ui(z.boolean().optional(), {
    label: "Show variation",
    group: "appearance",
    widget: "switch",
  }),
  showSparkline: ui(z.boolean().optional(), {
    label: "Show sparkline",
    group: "appearance",
    widget: "switch",
  }),
  sparklineAccent: ui(narrowString<ChartColorValue | "auto">().optional(), {
    label: "Sparkline colour",
    group: "appearance",
    widget: "color",
  }),
  invert: ui(
    z
      .boolean()
      .optional()
      .describe("Treat a falling value as the good outcome."),
    { label: "Invert variation", group: "behavior", widget: "switch" },
  ),
  compareLabel: ui(z.string().optional(), {
    label: "Comparison label",
    group: "content",
  }),
  staticValue: ui(
    z.number().optional().describe("Value shown when no data source is set."),
    { label: "Static value", group: "data", widget: "number" },
  ),
  staticDelta: ui(z.number().optional(), {
    label: "Static variation",
    group: "data",
    widget: "number",
  }),
  staticSparkline: ui(z.array(z.number()).optional(), {
    label: "Static sparkline",
    group: "data",
    widget: "json",
  }),
}) satisfies BlockOptionsFor<KpiCardProps>;

RegisterBlockType({
  type: "KpiCard",
  componentName: KPI_CARD_COMPONENT_NAME,
  schema: KpiCardSchema,
  meta: {
    name: "KPI card",
    icon: "i-ph-trend-up",
    description: "Single headline figure with its variation.",
    group: "visualization",
  },
});
