import { z } from "zod";
import { type Component, ComponentBuilder } from "../component";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { LiveToggle, type LiveToggleProps } from "./live-toggle";
import {
  PeriodSelector,
  type PeriodComparison,
  type PeriodComparisonControl,
  type PeriodPreset,
  type PeriodSelectorProps,
} from "./period-selector";
import type { BaseComponentProps } from "./types";

/** How large the toolbar draws its controls, its children's by default. */
export const PAGE_TOOLBAR_SIZES = ["xs", "sm", "md"] as const;
export type PageToolbarSize = (typeof PAGE_TOOLBAR_SIZES)[number];

export interface PageToolbarProps extends BaseComponentProps {
  /**
   * The size of the `LiveToggle` and `PeriodSelector` it holds, and of its
   * own "updated" label, unless a child sets its own. Defaults to `sm`.
   */
  size?: PageToolbarSize;
  /**
   * On a page without `live` (or without a `LiveToggle` in the toolbar),
   * shows how long ago the page last read its data ("updated 12 s ago"),
   * where the toggle would sit. Defaults to true.
   */
  showUpdatedAt?: boolean;
  /**
   * On a page without `live` (or without a `LiveToggle` in the toolbar), a
   * button beside the "updated" label reading every block of the page
   * again. Defaults to true.
   */
  refresh?: boolean;
}

const PAGE_TOOLBAR_COMPONENT_NAME = "dms-page-toolbar-block";

/**
 * The context bar of a page with a period or live data, first in its body,
 * under the page header: its own children on the left (a scope chip, a
 * picker), then on the right, whatever order they were added in, the time
 * since the page last read its data, the `LiveToggle` (Direct / Pause) and
 * the `PeriodSelector` (its window, its comparison, its presets), all at one
 * `size`. It wraps onto more lines on a narrow screen.
 *
 * On a page without `live` it shows "updated 12 s ago" and a refresh button
 * where the toggle would be (see `showUpdatedAt`, `refresh`); a `LiveToggle`
 * there draws nothing.
 *
 * Its children are ordinary blocks, with ids of their own: `pageToolbar()`
 * builds one with the usual defaults.
 *
 * ```ts
 * static toolbar = PageToolbar()
 *   .child("scope", scopeChip())
 *   .child("live", LiveToggle({ variant: "pill" }))
 *   .child("period", PeriodSelector({ variant: "segmented" }));
 * ```
 */
export function PageToolbar(
  options?: PageToolbarProps,
): ComponentBuilder<PageToolbarProps> {
  return new ComponentBuilder<PageToolbarProps>(PAGE_TOOLBAR_COMPONENT_NAME)
    .options({ ...options })
    .meta({ name: "PageToolbar", icon: "i-ph-sliders-horizontal" });
}

/** What `pageToolbar()` puts in the toolbar. */
export interface PageToolbarOptions extends PageToolbarProps {
  /**
   * The blocks on the left, keyed by child id, in order: a scope chip, a
   * picker, a badge. Their ids are the ones permissions name them by.
   */
  leading?: Record<string, Component>;
  /**
   * The `LiveToggle` (child id `live`), over the defaults of
   * {@link PAGE_TOOLBAR_LIVE_DEFAULTS}; `false` leaves it out. Kept by
   * default: it draws nothing on a page without `live`.
   */
  live?: LiveToggleProps | false;
  /**
   * The `PeriodSelector` (child id `period`), over the defaults of
   * {@link PAGE_TOOLBAR_PERIOD_DEFAULTS}; `false` leaves it out, for a page
   * without a period.
   */
  period?: PeriodSelectorProps | false;
}

/** The `LiveToggle` of `pageToolbar()` unless its `live` says otherwise. */
export const PAGE_TOOLBAR_LIVE_DEFAULTS: LiveToggleProps = {
  align: "right",
  variant: "pill",
};

const TOOLBAR_PRESETS: PeriodPreset[] = [
  "last-hour",
  "last-24h",
  "last-7-days",
  "last-30-days",
];

/**
 * The `PeriodSelector` of `pageToolbar()` unless its `period` says otherwise:
 * the start of the window from now ("since yesterday 11:29"), then the
 * 1H / 24H / 7D / 30D presets, on the last 24 hours by default. Its
 * comparison control depends on what the period offers: a menu naming the
 * compared window ("vs 16 – 17 Oct ▾") for more than one choice, `none`
 * included, on its first comparison besides `none`; none for a single
 * comparison, which then stays on and reads "vs …" beside the window.
 */
export const PAGE_TOOLBAR_PERIOD_DEFAULTS: PeriodSelectorProps = {
  variant: "segmented",
  align: "right",
  rangeLabel: "relative",
  presets: TOOLBAR_PRESETS,
  defaultPreset: "last-24h",
};

const NO_COMPARISON: PeriodComparison = "none";
// What a `PeriodSelector` offers without `comparisons`.
const SELECTOR_DEFAULT_COMPARISONS: PeriodComparison[] = [
  NO_COMPARISON,
  "previous-period",
  "previous-year",
];

/** The comparison setup of a toolbar's period. */
interface ToolbarComparisonSetup {
  comparisonControl: PeriodComparisonControl;
  defaultComparison?: PeriodComparison;
}

// The comparison control of PAGE_TOOLBAR_PERIOD_DEFAULTS' doc, under what
// the page's `period` sets itself.
function toolbarComparisonSetup(
  period: PeriodSelectorProps,
): ToolbarComparisonSetup {
  const offered = period.comparisons ?? SELECTOR_DEFAULT_COMPARISONS;
  if (offered.length <= 1) return { comparisonControl: "hidden" };
  const firstComparison = offered.find(
    (comparison) => comparison !== NO_COMPARISON,
  );
  return firstComparison
    ? { comparisonControl: "menu", defaultComparison: firstComparison }
    : { comparisonControl: "menu" };
}

const LIVE_CHILD_ID = "live";
const PERIOD_CHILD_ID = "period";

/**
 * A `PageToolbar` with its usual children: `leading` on the left, then the
 * `LiveToggle` as a pill (`live`) and the `PeriodSelector` as segmented
 * presets (`period`), each over its defaults. A page puts it first:
 *
 * ```ts
 * static toolbar = pageToolbar({
 *   leading: { scope: scopeChip() },
 *   live: { missedLabel: "$api.live.new_requests" },
 *   period: {
 *     id: "api",
 *     rememberKey: "api",
 *     comparisons: ["previous-period"],
 *   },
 * });
 * ```
 */
export function pageToolbar(
  options: PageToolbarOptions = {},
): ComponentBuilder<PageToolbarProps> {
  const { leading, live, period, ...props } = options;
  const toolbar = PageToolbar(props);
  for (const [id, component] of Object.entries(leading ?? {})) {
    toolbar.child(id, component);
  }
  if (live !== false) {
    toolbar.child(
      LIVE_CHILD_ID,
      LiveToggle({ ...PAGE_TOOLBAR_LIVE_DEFAULTS, ...live }),
    );
  }
  if (period !== false) {
    toolbar.child(
      PERIOD_CHILD_ID,
      PeriodSelector({
        ...PAGE_TOOLBAR_PERIOD_DEFAULTS,
        ...toolbarComparisonSetup(period ?? {}),
        ...period,
      }),
    );
  }
  return toolbar;
}

/** The options `PageToolbar` accepts. */
export const PageToolbarSchema = z.object({
  size: ui(
    z
      .enum(PAGE_TOOLBAR_SIZES)
      .optional()
      .describe("The size of the controls the toolbar holds."),
    { label: "Size", group: "appearance", widget: "segmented" },
  ),
  showUpdatedAt: ui(
    z
      .boolean()
      .optional()
      .describe(
        "Without live mode, shows how long ago the page last read its data.",
      ),
    { label: "Show the last update", group: "appearance", widget: "switch" },
  ),
  refresh: ui(
    z
      .boolean()
      .optional()
      .describe("Without live mode, offers a button reading the page again."),
    { label: "Refresh button", group: "behavior", widget: "switch" },
  ),
}) satisfies BlockOptionsFor<PageToolbarProps>;

RegisterBlockType({
  type: "PageToolbar",
  componentName: PAGE_TOOLBAR_COMPONENT_NAME,
  schema: PageToolbarSchema,
  container: true,
  meta: {
    name: "Page toolbar",
    icon: "i-ph-sliders-horizontal",
    description:
      "Context bar of a page: its scope, the last update, live mode and period.",
    group: "data",
  },
});
