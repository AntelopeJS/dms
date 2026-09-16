import { type Component, ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  RegisterBlockType,
  requiredOpaqueOption,
  ui,
} from "./block-registry";
import { VALUE_FORMATS, type ValueFormat, type ValuePrecision } from "./chart";
import { CHART_BLOCK_TYPES } from "./chart-schemas";
import type { BaseComponentProps } from "./types";
import { HttpMethod } from "./types/http";

export interface ChartCardProps extends BaseComponentProps {
  title: string;
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  showLegend?: boolean;
  primaryLabel?: string;
  comparisonLabel?: string;
}

export interface ChartCardBuilderOptions extends ChartCardProps {
  chart: Component;
}

const CHART_CARD_COMPONENT_NAME = "dms-chart-card";
const NESTED_CHART_ID = "chart";

export function ChartCard(
  options: ChartCardBuilderOptions,
): ComponentBuilder<ChartCardProps> {
  const { chart, ...rest } = options;
  return new ComponentBuilder<ChartCardProps>(CHART_CARD_COMPONENT_NAME)
    .options(rest)
    .meta({
      name: rest.title,
      icon: rest.icon || "i-ph-chart-line",
    })
    .child(NESTED_CHART_ID, chart);
}

/** The options `ChartCard` accepts, including the chart it wraps. */
export const ChartCardSchema = z.object({
  title: ui(z.string().describe("Card heading."), {
    label: "Title",
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  icon: ui(z.string().optional(), {
    label: "Icon",
    group: "appearance",
    widget: "icon",
  }),
  chart: ui(
    requiredOpaqueOption<Component>().describe(
      "The chart block the card wraps.",
    ),
    {
      label: "Chart",
      group: "data",
      widget: "block",
      blockTypes: CHART_BLOCK_TYPES,
    },
  ),
  fetchUrl: ui(z.string().optional(), {
    label: "Data source",
    group: "data",
    widget: "query",
  }),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "data",
    widget: "select",
  }),
  periodScope: ui(z.string().optional(), {
    label: "Period scope",
    group: "data",
  }),
  valueFormat: ui(z.enum(VALUE_FORMATS).optional(), {
    label: "Value format",
    group: "appearance",
    widget: "segmented",
  }),
  currencyCode: ui(z.string().optional(), {
    label: "Currency",
    group: "appearance",
  }),
  showDelta: ui(z.boolean().optional(), {
    label: "Show variation",
    group: "appearance",
    widget: "switch",
  }),
  showLegend: ui(z.boolean().optional(), {
    label: "Show legend",
    group: "appearance",
    widget: "switch",
  }),
  primaryLabel: ui(z.string().optional(), {
    label: "Series label",
    group: "content",
  }),
  comparisonLabel: ui(z.string().optional(), {
    label: "Comparison label",
    group: "content",
  }),
}) satisfies BlockOptionsFor<ChartCardBuilderOptions>;

RegisterBlockType({
  type: "ChartCard",
  componentName: CHART_CARD_COMPONENT_NAME,
  schema: ChartCardSchema,
  meta: {
    name: "Chart card",
    icon: "i-ph-chart-line",
    description: "Framed chart with its headline value and comparison.",
    group: "visualization",
  },
});
