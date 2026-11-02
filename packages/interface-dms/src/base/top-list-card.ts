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
import {
  type BlockLinkAction,
  blockActionsOption,
  blockRealtimeTopicOption,
} from "./display";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import { blockTextSchema } from "./internal/composed-text";
import type { BaseComponentProps, EnumOption } from "./types";
import type { BlockText } from "./types/composed-text";
import { HttpMethod } from "./types/http";

export interface TopListItemAvatar {
  src: string;
  alt?: string;
}

export interface TopListItem {
  id: string | number;
  /** Row title: a literal, a `$`-prefixed i18n key, or a `ComposedText`. */
  title: BlockText;
  /**
   * Dimmed line under the title, like the title: a `ComposedText` writes
   * "3 min ago" in the reader's language (`{ key: "api.last_call", params:
   * { at: { type: "relative", value: "2026-10-10T08:00:00Z" } } }`).
   */
  description?: BlockText;
  value: number;
  /**
   * The value as written, in place of the formatted `value`, which still
   * sizes the bar: a `$` key, a literal or a `ComposedText`, for a figure a
   * format cannot write ("1.9 s (partial)"). `valueSuffix` is not added to it.
   */
  valueLabel?: BlockText;
  /** The change in percent: 12.5 reads +12.5 %. */
  delta?: number | null;
  sparkline?: number[];
  icon?: string;
  avatar?: TopListItemAvatar;
  /**
   * Where the row leads. It may name the page it is shown on, as
   * `fetchUrl` does: `{{params.X}}` and `{{query.X}}` are filled from the
   * page URL when the row is drawn, and a query pair whose token the page
   * has no value for is left out, so
   * `/pages?website={{query.website}}&sales.period={{query.sales.period}}`
   * keeps the page's website and period.
   */
  to?: string;
}

export interface TopListCardProps extends BaseComponentProps {
  title: string;
  description?: string;
  /**
   * Where the data is read from. `{{params.X}}` and `{{query.X}}` name the
   * page URL, as in `BlockItemsSource.fetchUrl`.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  periodScope?: string;
  /**
   * Topics the backend publishes on (`PublishMessage`) when the data moves:
   * the card reads `fetchUrl` again on each event, keeping what it shows,
   * through the page's `live` gate. The page registers them.
   */
  realtimeTopic?: string | string[];
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  /**
   * Unit written right after each formatted value: `" ms"` makes 1864
   * "1,864 ms". Written as given, so a space goes in it; a `$`-prefixed i18n
   * key is translated. Not added to a row's `valueLabel`.
   */
  valueSuffix?: string;
  showRank?: boolean;
  highlightTopN?: number;
  rankColor?: ChartColorValue;
  showDelta?: boolean;
  showSparkline?: boolean;
  /** Draws a proportional bar under each row, scaled to the largest value. */
  showBar?: boolean;
  sparklineAccent?: ChartColorValue | "auto";
  invert?: boolean;
  badgeColor?: ChartColorValue;
  maxHeight?: string;
  staticItems?: TopListItem[];
  emptyLabel?: string;
  /**
   * Link buttons in the card head, after the period badge ("Catalogue →",
   * "View all"): quiet ghost buttons unless one sets its own look.
   */
  actions?: BlockLinkAction[];
  /**
   * How many placeholder rows the card draws while `fetchUrl` loads: the
   * length the route answers (its "top N"), so a short list keeps its height
   * when the rows land.
   *
   * Optional. Defaults to 10, which fills the default `maxHeight`.
   */
  skeletonCount?: number;
}

const TOP_LIST_CARD_COMPONENT_NAME = "dms-top-list-card";
const DEFAULT_ICON = "i-ph-list-numbers";

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `TopListCard()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 *
 * @docsApi
 */
export function TopListCard(
  options?: TopListCardProps,
): ComponentBuilder<TopListCardProps> {
  return attachRealtimeTopicsHook(
    new ComponentBuilder<TopListCardProps>(TOP_LIST_CARD_COMPONENT_NAME)
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public builders allow omitted options while pages are authored; a required title need not exist yet.
      .options({ ...options } as TopListCardProps)
      .meta({
        name: options?.title || "Top list",
        icon: DEFAULT_ICON,
      }),
    options?.realtimeTopic,
  );
}

const TopListItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: blockTextSchema(),
  description: blockTextSchema().optional(),
  value: z.number(),
  valueLabel: blockTextSchema().optional(),
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
  fetchUrl: ui(z.string().optional().describe("Where the list is read from."), {
    label: "Data source",
    group: "data",
    widget: "dataSource",
    // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Published BlockOptionUi property controls source compatibility and cannot be renamed.
    responseShape: "items",
    periodOption: "periodScope",
  }),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  }),
  periodScope: ui(z.string().optional(), {
    label: "Period scope",
    group: "advanced",
  }),
  realtimeTopic: blockRealtimeTopicOption(),
  valueFormat: ui(z.enum(VALUE_FORMATS).optional(), {
    label: "Value format",
    group: "appearance",
    widget: "segmented",
  }),
  currencyCode: ui(z.string().optional(), {
    label: "Currency",
    group: "appearance",
  }),
  valueSuffix: ui(
    z
      .string()
      .optional()
      .describe(
        'Text after each value, such as " ms" (with its leading space).',
      ),
    { label: "Value unit", group: "appearance" },
  ),
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
  showBar: ui(z.boolean().optional(), {
    label: "Show bar",
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
    group: "advanced",
    widget: "json",
  }),
  emptyLabel: ui(z.string().optional(), {
    label: "Empty message",
    group: "content",
  }),
  actions: blockActionsOption(
    "Buttons at the top of the card, each opening a page.",
  ),
  skeletonCount: ui(
    z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Placeholder rows drawn while the data source loads."),
    {
      label: "Loading placeholders",
      group: "data",
      widget: "number",
      min: 1,
      advanced: true,
    },
  ),
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
