import { z } from "zod";
import { ComponentBuilder } from "../component";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types";

/** Where the toggle sits in its row. */
export const LIVE_TOGGLE_ALIGNS = ["left", "center", "right"] as const;
export type LiveToggleAlign = (typeof LIVE_TOGGLE_ALIGNS)[number];

/**
 * How the toggle is drawn: `segmented`, two segments Live / Pause (the
 * default), or `pill`, a "Live" pill with a pulsing dot beside a Pause
 * button, and a Resume button while paused.
 */
export const LIVE_TOGGLE_VARIANTS = ["segmented", "pill"] as const;
export type LiveToggleVariant = (typeof LIVE_TOGGLE_VARIANTS)[number];

/** How large the toggle and its texts are drawn. */
export const LIVE_TOGGLE_SIZES = ["xs", "sm", "md"] as const;
export type LiveToggleSize = (typeof LIVE_TOGGLE_SIZES)[number];

export interface LiveToggleProps extends BaseComponentProps {
  align?: LiveToggleAlign;
  /**
   * Shows how long ago the page last read its data ("updated 12 s ago"),
   * counted in the browser. Defaults to true.
   */
  showUpdatedAt?: boolean;
  /** How the toggle is drawn (see {@link LiveToggleVariant}). Defaults to `segmented`. */
  variant?: LiveToggleVariant;
  /**
   * How large it is drawn, either variant. Defaults to the size of the
   * `PageToolbar` holding it, else `sm`.
   */
  size?: LiveToggleSize;
  /**
   * What the paused toggle calls the events it missed: an i18n key (prefixed
   * with `$`) or a text, given `{count}` and pluralised on it, e.g.
   * `"$api.live.new_requests"` for "40 new requests". Defaults to "N new".
   */
  missedLabel?: string;
}

const LIVE_TOGGLE_COMPONENT_NAME = "dms-live-toggle-block";

/**
 * The Live / Pause switch of a page declared with `live` (see
 * `PageLiveOptions`), with the time since the page last read its data. The L
 * key switches it too, outside a text field. On a page without `live` it
 * renders nothing.
 *
 * Paused, it says so and why: "Paused · typing in the Tester" when a component
 * holds the page (`usePageLive().hold(reason)`), then the events missed
 * ("40 new requests", see `missedLabel`) and the breakdown a module's
 * component gives with `usePageLive().setMissedDetail()` ("2 in 5xx").
 *
 * The state belongs to the page, not to the block: every block and table of
 * the page follows it, and a custom component reads it with `usePageLive()`.
 *
 * ```ts
 * static toolbar = HStack().child(
 *   "live",
 *   LiveToggle({ variant: "pill", missedLabel: "$api.live.new_requests" }),
 * );
 * ```
 *
 * @docsApi
 */
export function LiveToggle(
  options?: LiveToggleProps,
): ComponentBuilder<LiveToggleProps> {
  return new ComponentBuilder<LiveToggleProps>(LIVE_TOGGLE_COMPONENT_NAME)
    .options({ ...options })
    .meta({ name: "LiveToggle", icon: "i-ph-broadcast" });
}

/** The options `LiveToggle` accepts. */
export const LiveToggleSchema = z.object({
  align: ui(z.enum(LIVE_TOGGLE_ALIGNS).optional(), {
    label: "Alignment",
    group: "appearance",
    widget: "segmented",
  }),
  showUpdatedAt: ui(
    z
      .boolean()
      .optional()
      .describe("Shows how long ago the page last read its data."),
    { label: "Show the last update", group: "appearance", widget: "switch" },
  ),
  variant: ui(z.enum(LIVE_TOGGLE_VARIANTS).optional(), {
    label: "Variant",
    group: "appearance",
    widget: "segmented",
  }),
  size: ui(z.enum(LIVE_TOGGLE_SIZES).optional(), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  missedLabel: ui(
    z
      .string()
      .optional()
      .describe(
        "What the paused toggle calls the missed events, given {count}.",
      ),
    { label: "Missed events label", group: "content" },
  ),
}) satisfies BlockOptionsFor<LiveToggleProps>;

RegisterBlockType({
  type: "LiveToggle",
  componentName: LIVE_TOGGLE_COMPONENT_NAME,
  schema: LiveToggleSchema,
  meta: {
    name: "Live toggle",
    icon: "i-ph-broadcast",
    description:
      "Live / Pause switch of a live page, with the time since its last update.",
    group: "data",
  },
});
