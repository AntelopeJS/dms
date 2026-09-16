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

export interface TopListItemAvatar {
  src: string;
  alt?: string;
}

export interface TopListItem {
  id: string | number;
  title: string;
  description?: string;
  value: number;
  delta?: number | null;
  sparkline?: number[];
  icon?: string;
  avatar?: TopListItemAvatar;
  to?: string;
}

export interface TopListCardProps extends BaseComponentProps {
  title: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showRank?: boolean;
  highlightTopN?: number;
  rankColor?: ChartColorValue;
  showDelta?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: ChartColorValue | "auto";
  invert?: boolean;
  badgeColor?: ChartColorValue;
  maxHeight?: string;
  staticItems?: TopListItem[];
  emptyLabel?: string;
}

const TOP_LIST_CARD_COMPONENT_NAME = "dms-top-list-card";
const DEFAULT_ICON = "i-ph-list-numbers";

export function TopListCard(
  options: TopListCardProps,
): ComponentBuilder<TopListCardProps> {
  return new ComponentBuilder<TopListCardProps>(TOP_LIST_CARD_COMPONENT_NAME)
    .options(options)
    .meta({
      name: options.title,
      icon: DEFAULT_ICON,
    });
}

const TopListItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string(),
  description: z.string().optional(),
  value: z.number(),
  delta: z.number().nullable().optional(),
  sparkline: z.array(z.number()).optional(),
  icon: ui(z.string().optional(), { widget: "icon" }),
  avatar: z.object({ src: z.string(), alt: z.string().optional() }).optional(),
  to: ui(z.string().optional(), { widget: "url" }),
}) satisfies BlockOptionsFor<TopListItem>;

/** The options `TopListCard` accepts. */
export const TopListCardSchema = z.object({
  title: ui(z.string().describe("Card heading."), {
    label: "Title",
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  fetchUrl: ui(
    z.string().optional().describe("Endpoint the list is read from."),
    { label: "Data source", group: "data", widget: "query" },
  ),
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
  showRank: ui(z.boolean().optional(), {
    label: "Show rank",
    group: "appearance",
    widget: "switch",
  }),
  highlightTopN: ui(
    z.number().int().optional().describe("How many leading rows to highlight."),
    { label: "Highlight top", group: "appearance", widget: "number", min: 0 },
  ),
  rankColor: ui(narrowString<ChartColorValue>().optional(), {
    label: "Rank colour",
    group: "appearance",
    widget: "color",
  }),
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
  invert: ui(z.boolean().optional(), {
    label: "Invert variation",
    group: "behavior",
    widget: "switch",
  }),
  badgeColor: ui(narrowString<ChartColorValue>().optional(), {
    label: "Badge colour",
    group: "appearance",
    widget: "color",
  }),
  maxHeight: ui(z.string().optional(), {
    label: "Maximum height",
    group: "appearance",
  }),
  staticItems: ui(z.array(TopListItemSchema).optional(), {
    label: "Static rows",
    group: "data",
    widget: "json",
  }),
  emptyLabel: ui(z.string().optional(), {
    label: "Empty message",
    group: "content",
  }),
}) satisfies BlockOptionsFor<TopListCardProps>;

RegisterBlockType({
  type: "TopListCard",
  componentName: TOP_LIST_CARD_COMPONENT_NAME,
  schema: TopListCardSchema,
  meta: {
    name: "Top list",
    icon: DEFAULT_ICON,
    description: "Ranked rows with their values and variations.",
    group: "visualization",
  },
});
