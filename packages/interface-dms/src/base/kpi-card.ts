import { ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  narrowString,
  RegisterBlockType,
  ui,
} from "./block-registry";
import { blockRealtimeTopicOption } from "./display";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import {
  type ChartColorValue,
  VALUE_FORMATS,
  type ValueFormat,
  type ValuePrecision,
} from "./chart";
import type { BaseComponentProps, EnumOption } from "./types";
import { HttpMethod } from "./types/http";

export interface KpiCardProps extends BaseComponentProps {
  title: string;
  /** "stat" = compact DMS look: mono uppercase label, bare icon. */
  variant?: "default" | "stat";
  description?: string;
  icon?: string;
  /**
   * Where the data is read from. `{{params.X}}` and `{{query.X}}` name the
   * page URL, as in `BlockItemsSource.fetchUrl`.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /**
   * Id of the `PeriodSelector` driving the card. The comparison it selects
   * names the card's change ("vs previous year"), and "no comparison" hides
   * the change, the comparison value and the comparison label.
   */
  periodScope?: string;
  /**
   * Topics the backend publishes on (`PublishMessage`) when the figure moves:
   * the card reads `fetchUrl` again on each event, keeping what it shows,
   * through the page's `live` gate. The page registers them.
   */
  realtimeTopic?: string | string[];
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  /**
   * Shows the figure the value is compared against ("vs €42,900"), formatted
   * as the value, when the data carries `previousValue`. Defaults to `true`;
   * `false` keeps a card compact.
   */
  showPreviousValue?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: ChartColorValue | "auto";
  invert?: boolean;
  /**
   * The caption of the change. Optional: a card with a `periodScope` and no
   * `description` names the comparison its selector applies on its own, so
   * set it only for a wording of your own. Hidden with no comparison.
   */
  compareLabel?: string;
  staticValue?: number;
  /** The change in percent, as a fetched `delta`: 12.5 reads +12.5 %. */
  staticDelta?: number;
  /** The figure compared against, as a fetched `previousValue`. */
  staticPreviousValue?: number;
  staticSparkline?: number[];
}

const KPI_CARD_COMPONENT_NAME = "dms-kpi-card";

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `KpiCard()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 */
export function KpiCard(
  options?: KpiCardProps,
): ComponentBuilder<KpiCardProps> {
  return attachRealtimeTopicsHook(
    new ComponentBuilder<KpiCardProps>(KPI_CARD_COMPONENT_NAME)
      .options({ ...options } as KpiCardProps)
      .meta({
        name: options?.title || "KPI card",
        icon: options?.icon || "i-ph-trend-up",
      }),
    options?.realtimeTopic,
  );
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
  icon: ui(z.string().optional().describe("The icon shown on the card."), {
    label: "Icon",
    group: "appearance",
    widget: "icon",
  }),
  variant: ui(
    z
      .enum(["default", "stat"])
      .optional()
      .describe("Stat draws the card in a compact style."),
    { label: "Variant", group: "appearance", widget: "segmented" },
  ),
  fetchUrl: ui(
    z.string().optional().describe("Where the card reads its value from."),
    {
      label: "Data source",
      group: "data",
      widget: "dataSource",
      responseShape: "value",
      periodOption: "periodScope",
    },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  }),
  periodScope: ui(
    z
      .string()
      .optional()
      .describe("Id of the PeriodSelector driving this card."),
    { label: "Period scope", group: "advanced" },
  ),
  realtimeTopic: blockRealtimeTopicOption(),
  valueFormat: ui(z.enum(VALUE_FORMATS).optional(), {
    label: "Value format",
    group: "appearance",
    widget: "segmented",
  }),
  currencyCode: ui(
    z
      .string()
      .optional()
      .describe(
        "The currency, as a three-letter code such as EUR, when the value is an amount.",
      ),
    { label: "Currency", group: "appearance" },
  ),
  showDelta: ui(z.boolean().optional(), {
    label: "Show variation",
    group: "appearance",
    widget: "switch",
  }),
  showPreviousValue: ui(
    z
      .boolean()
      .optional()
      .describe("Show the figure the value is compared against."),
    { label: "Show comparison value", group: "appearance", widget: "switch" },
  ),
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
  compareLabel: ui(
    z
      .string()
      .optional()
      .describe(
        "Caption of the variation; follows the period selector's comparison when empty.",
      ),
    { label: "Comparison label", group: "content" },
  ),
  staticValue: ui(
    z.number().optional().describe("Value shown when no data source is set."),
    { label: "Static value", group: "advanced", widget: "number" },
  ),
  staticDelta: ui(z.number().optional(), {
    label: "Static variation",
    group: "advanced",
    widget: "number",
  }),
  staticPreviousValue: ui(z.number().optional(), {
    label: "Static comparison value",
    group: "advanced",
    widget: "number",
  }),
  staticSparkline: ui(z.array(z.number()).optional(), {
    label: "Static sparkline",
    group: "advanced",
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
