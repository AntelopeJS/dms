import { z } from "zod";
import {
  type Component,
  ComponentBuilder,
  type ComponentMetadata,
} from "../component";
import type { MaybePromise } from "../types";
import {
  type BlockInitialChild,
  type BlockOptionsFor,
  RegisterBlockType,
  ui,
} from "./block-registry";
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

/**
 * How `pageToolbar()` places one of its own children (the `LiveToggle`, the
 * `PeriodSelector`), besides the control's options: the child id roles and
 * permissions name it by, and the metadata the roles editor shows for it.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published default allows application component options; a concrete schema belongs to each child component.
export interface PageToolbarChildOptions<P = Record<string, unknown>> {
  /**
   * The child id under the toolbar. Defaults to `live` for the toggle and
   * `period` for the selector; set it to keep an id roles already grant
   * (a page that had its toggle under `toggle`).
   */
  childId?: string;
  /** The child's name, description and icon in the roles editor. */
  meta?: Partial<ComponentMetadata>;
  /**
   * Changes the control's options each time the page is registered, as
   * `ComponentBuilder.transformOptions` does: for what is only known once
   * the module is configured (a retention read in `construct()`, after the
   * page class was built). It receives the options over the defaults and
   * returns new ones, without mutating them. The comparison control the
   * helper derived from `comparisons` at build time is not derived again.
   */
  transformOptions?: (options: P | undefined) => MaybePromise<P | undefined>;
}

/** The `live` entry of {@link PageToolbarOptions}. */
export type PageToolbarLiveOptions = LiveToggleProps &
  PageToolbarChildOptions<LiveToggleProps>;

/** The `period` entry of {@link PageToolbarOptions}. */
export type PageToolbarPeriodOptions = PeriodSelectorProps &
  PageToolbarChildOptions<PeriodSelectorProps>;

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
   * default: it draws nothing on a page without `live`. `childId` and `meta`
   * place the child (see {@link PageToolbarChildOptions}).
   */
  live?: PageToolbarLiveOptions | false;
  /**
   * The `PeriodSelector` (child id `period`), over the defaults of
   * {@link PAGE_TOOLBAR_PERIOD_DEFAULTS}; `false` leaves it out, for a page
   * without a period. `childId` and `meta` place the child (see
   * {@link PageToolbarChildOptions}); `id` stays the period scope's id.
   */
  period?: PageToolbarPeriodOptions | false;
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

/** The child id of the toolbar's `LiveToggle` unless `live.childId` says otherwise. */
export const PAGE_TOOLBAR_LIVE_CHILD_ID = "live";
/** The child id of the toolbar's `PeriodSelector` unless `period.childId` says otherwise. */
export const PAGE_TOOLBAR_PERIOD_CHILD_ID = "period";

/**
 * One control of a toolbar's default children: the catalog entry an editor
 * starts a new toolbar with, and the block `pageToolbar()` places.
 */
interface ToolbarControl extends BlockInitialChild {
  /** The control as `pageToolbar()` places it, its metadata and transform on. */
  build(): Component;
}

function placed<P>(
  builder: ComponentBuilder<P>,
  { meta, transformOptions }: PageToolbarChildOptions<P>,
): ComponentBuilder<P> {
  if (meta) builder.meta(meta);
  if (transformOptions) builder.transformOptions(transformOptions);
  return builder;
}

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
 *
 * Each control keeps the id and the roles-editor metadata a page gives it:
 *
 * ```ts
 * static toolbar = pageToolbar({
 *   live: { childId: "toggle", meta: { name: "$my.permissions.live.name" } },
 *   period: { id: "my-scope", meta: { name: "$my.permissions.period.name" } },
 * }).meta({ name: "$my.permissions.toolbar.name" });
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
  for (const control of toolbarControls(live, period)) {
    toolbar.child(control.id, control.build());
  }
  return toolbar;
}

/**
 * The toolbar's default children, in order: the `LiveToggle` then the
 * `PeriodSelector`, each over its defaults. The one source of what a toolbar
 * holds, for `pageToolbar()` and for the catalog's `initialChildren`.
 */
function toolbarControls(
  live: PageToolbarOptions["live"],
  period: PageToolbarOptions["period"],
): ToolbarControl[] {
  const controls: ToolbarControl[] = [];
  if (live !== false) {
    const { childId, meta, transformOptions, ...liveProps } = live ?? {};
    const liveOptions = { ...PAGE_TOOLBAR_LIVE_DEFAULTS, ...liveProps };
    controls.push({
      id: childId ?? PAGE_TOOLBAR_LIVE_CHILD_ID,
      type: "LiveToggle",
      options: liveOptions,
      build: () => placed(LiveToggle(liveOptions), { meta, transformOptions }),
    });
  }
  if (period !== false) {
    const { childId, meta, transformOptions, ...periodProps } = period ?? {};
    const periodOptions = {
      ...PAGE_TOOLBAR_PERIOD_DEFAULTS,
      ...toolbarComparisonSetup(periodProps),
      ...periodProps,
    };
    controls.push({
      id: childId ?? PAGE_TOOLBAR_PERIOD_CHILD_ID,
      type: "PeriodSelector",
      options: periodOptions,
      build: () =>
        placed(PeriodSelector(periodOptions), { meta, transformOptions }),
    });
  }
  return controls;
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
  initialChildren: toolbarControls(undefined, undefined).map(
    ({ id, type, options }) => ({ id, type, options }),
  ),
});
