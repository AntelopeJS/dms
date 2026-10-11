import { z } from "zod";
import { ComponentBuilder } from "../component";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types";

/** Where the toggle sits in its row. */
export const LIVE_TOGGLE_ALIGNS = ["left", "center", "right"] as const;
export type LiveToggleAlign = (typeof LIVE_TOGGLE_ALIGNS)[number];

export interface LiveToggleProps extends BaseComponentProps {
  align?: LiveToggleAlign;
  /**
   * Shows how long ago the page last read its data ("updated 12 s ago"),
   * counted in the browser. Defaults to true.
   */
  showUpdatedAt?: boolean;
}

const LIVE_TOGGLE_COMPONENT_NAME = "dms-live-toggle-block";

/**
 * The Direct / Pause switch of a page declared with `live` (see
 * `PageLiveOptions`), with the time since the page last read its data. The L
 * key switches it too, outside a text field. On a page without `live` it
 * renders nothing.
 *
 * The state belongs to the page, not to the block: every block and table of
 * the page follows it, and a custom component reads it with `usePageLive()`.
 *
 * ```ts
 * static toolbar = HStack().child("live", LiveToggle({ align: "right" }));
 * ```
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
}) satisfies BlockOptionsFor<LiveToggleProps>;

RegisterBlockType({
  type: "LiveToggle",
  componentName: LIVE_TOGGLE_COMPONENT_NAME,
  schema: LiveToggleSchema,
  meta: {
    name: "Live toggle",
    icon: "i-ph-broadcast",
    description:
      "Direct / Pause switch of a live page, with the time since its last update.",
    group: "data",
  },
});
