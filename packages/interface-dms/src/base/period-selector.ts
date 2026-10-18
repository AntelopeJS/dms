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
  "all",
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

/**
 * How the selector writes the window beside its control: `absolute` gives
 * both bounds ("Oct 10, 7:54 PM – Oct 11, 7:54 PM"), `relative` its start
 * from now ("since yesterday 11:52", "since Oct 4, 11:52").
 */
export const PERIOD_RANGE_LABELS = ["absolute", "relative"] as const;
export type PeriodRangeLabel = (typeof PERIOD_RANGE_LABELS)[number];

/**
 * How the selector offers its comparisons: `menu` lists them in a dropdown,
 * `toggle` is one inline button switching the comparison on and off, and
 * `hidden` shows nothing, the comparison staying on.
 */
export const PERIOD_COMPARISON_CONTROLS = ["menu", "toggle", "hidden"] as const;
export type PeriodComparisonControl =
  (typeof PERIOD_COMPARISON_CONTROLS)[number];

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

/**
 * A date-range control publishing its period under `id`, for the cards,
 * charts, blocks and source tables naming it as their `periodScope`.
 *
 * The period lives in the page URL, always: a range is
 * `?<id>.period=last-7-days&<id>.compare=previous-period`, a custom range
 * `?<id>.from=2026-10-01&<id>.to=2026-10-31` (an ISO date or date-time each;
 * a custom comparison adds `<id>.compareFrom` / `<id>.compareTo`). The `all`
 * preset (`?<id>.period=all`) has no bounds: its cards are sent no `from` /
 * `to`. A link naming a range opens on it even when `custom` is not offered,
 * no preset selected (an incident's window, say). Keys are
 * prefixed with the id, so several selectors on a page never collide. The
 * URL is written once the page is shown (a copied URL always carries the
 * period), then on each change, replacing the current history entry rather
 * than pushing one, so Back leaves the page instead of stepping through
 * every pick. The server renders the URL's period.
 *
 * On load the period comes from the URL, then from the last choice the user
 * made on this selector of this page — or on any selector sharing its
 * `rememberKey` — (kept in the browser, for the 20 most recent selectors),
 * then from `defaultPreset` / `defaultComparison`. The
 * range and the comparison are
 * read apart, and a value that is unknown, not offered by `presets` /
 * `comparisons`, or not a valid date range is skipped for the next source.
 */
export interface PeriodSelectorProps extends BaseComponentProps {
  /**
   * Scope id the cards on the page refer to, and the prefix of the selector's
   * URL keys (`?<id>.period=`). Defaults to {@link DEFAULT_PERIOD_SCOPE}.
   */
  id?: string;
  /** The range when neither the URL nor the user's last choice gives one. */
  defaultPreset?: PeriodPreset;
  /** The comparison when neither the URL nor the user's last choice gives one. */
  defaultComparison?: PeriodComparison;
  presets?: PeriodPreset[];
  comparisons?: PeriodComparison[];
  presetLabels?: Partial<Record<PeriodPreset, string>>;
  comparisonLabels?: Partial<Record<PeriodComparison, string>>;
  align?: PeriodAlign;
  /**
   * How large the controls are drawn. Defaults to the size of the
   * `PageToolbar` holding the selector, where the window beside them scales
   * with it too, else `sm`.
   */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showRangeLabel?: boolean;
  /**
   * How the window beside the control reads: `absolute` (the default) gives
   * both bounds, `relative` its start from now, in the reader's locale
   * ("since yesterday 11:52"). A window ending before now keeps its bounds.
   */
  rangeLabel?: PeriodRangeLabel;
  /**
   * How the comparisons are offered (see {@link PeriodComparisonControl}).
   * Defaults to `toggle` when `comparisons` offers a single comparison
   * besides `none`, `menu` otherwise. The toggle switches between that
   * comparison and `none`; `hidden` keeps the comparison on
   * (`defaultComparison`, else the first one offered besides `none`).
   */
  comparisonControl?: PeriodComparisonControl;
  /**
   * Shares the remembered last choice with every selector carrying the same
   * key, on any page: a module's pages give theirs one key so the period
   * follows the user from page to page. Without it the choice is kept per
   * page and per `id`. A choice a selector does not offer is skipped there.
   */
  rememberKey?: string;
  /**
   * `segmented` renders the presets as inline pills for one-click range
   * switching; the custom range stays in its popover calendar.
   */
  variant?: PeriodSelectorVariant;
  /**
   * The longest custom range, in days (both ends included), the user can
   * pick: once a start day is picked, the calendar disables the days past
   * it, a range typed in the date fields is cut to it, and the popover says
   * so. Presets are not limited, nor is a range a link puts in the URL: the
   * endpoint still has to enforce its own limit.
   */
  maxDays?: number;
}

const PERIOD_SELECTOR_COMPONENT_NAME = "dms-period-selector";

/**
 * A period selector; it keeps its period in the page URL under keys prefixed
 * with its `id` (see {@link PeriodSelectorProps}).
 *
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
  all: "All time",
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
  presets: ui(
    z
      .array(presetSchema)
      .optional()
      .describe("The periods people can pick from."),
    {
      label: "Available ranges",
      group: "behavior",
    },
  ),
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
  rangeLabel: ui(
    z
      .enum(PERIOD_RANGE_LABELS)
      .optional()
      .describe(
        "Relative says how long ago the period starts, rather than its dates.",
      ),
    { label: "Range format", group: "appearance", widget: "segmented" },
  ),
  comparisonControl: ui(
    z
      .enum(PERIOD_COMPARISON_CONTROLS)
      .optional()
      .describe("How the comparisons are offered."),
    { label: "Comparison control", group: "appearance", widget: "segmented" },
  ),
  rememberKey: ui(
    z
      .string()
      .optional()
      .describe("Selectors sharing this key share the remembered period."),
    { label: "Remember key", group: "advanced" },
  ),
  variant: ui(
    z
      .enum(PERIOD_SELECTOR_VARIANTS)
      .optional()
      .describe("Segmented shows the periods as buttons side by side."),
    { label: "Variant", group: "appearance", widget: "segmented" },
  ),
  maxDays: ui(
    z
      .number()
      .int()
      .positive()
      .optional()
      .describe("The longest custom range the user can pick, in days."),
    { label: "Longest custom range (days)", group: "behavior" },
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
