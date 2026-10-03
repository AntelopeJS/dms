import { z } from "zod";
import { type BlockOptionsFor, ui } from "./block-registry";
import type { EnumOption } from "./types/enum-option";
import { HttpMethod } from "./types/http";

/**
 * Shared vocabulary of the display blocks — StatStrip, KeyValueList,
 * NavCardGrid, EmptyState, Banner, Card: the semantic tones they colour with
 * and the link buttons they offer.
 */

/** The semantic tones a display block colours a well, a pill or a line with. */
export const DISPLAY_TONES = [
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
] as const;

export type DisplayTone = (typeof DISPLAY_TONES)[number];

/**
 * The tones of an icon well: the semantic ones plus `muted`, the quiet well
 * of a settings row or a status strip cell.
 */
export const ICON_TONES = [...DISPLAY_TONES, "muted"] as const;

export type IconTone = (typeof ICON_TONES)[number];

export const BLOCK_ACTION_VARIANTS = [
  "solid",
  "outline",
  "soft",
  "subtle",
  "ghost",
  "link",
] as const;

export type BlockActionVariant = (typeof BLOCK_ACTION_VARIANTS)[number];

/**
 * A link button a display block renders. `to` is a DMS route, an `#anchor` on
 * the page, or an absolute URL (opened in a new tab). The block picks the look
 * of the buttons by their place; `variant` and `color` override it.
 */
export interface BlockLinkAction {
  /** Button text; `$`-prefixed for an i18n key. */
  label: string;
  to: string;
  icon?: string;
  variant?: BlockActionVariant;
  color?: DisplayTone;
}

export const BlockLinkActionSchema = z.object({
  label: ui(z.string().describe("Button text."), { label: "Label" }),
  to: ui(z.string().describe("Route, `#anchor` or absolute URL."), {
    label: "Link",
    widget: "url",
  }),
  icon: ui(z.string().optional(), { label: "Icon", widget: "icon" }),
  variant: ui(z.enum(BLOCK_ACTION_VARIANTS).optional(), {
    label: "Variant",
    widget: "select",
  }),
  color: ui(z.enum(DISPLAY_TONES).optional(), {
    label: "Colour",
    widget: "select",
  }),
}) satisfies BlockOptionsFor<BlockLinkAction>;

/** The link buttons option of a display block. */
export const blockActionsOption = (description: string) =>
  ui(z.array(BlockLinkActionSchema).optional().describe(description), {
    label: "Actions",
    group: "content",
  });

/**
 * The options a list block reads its items from a route with. The route
 * answers `{ items: [...] }` in the block's own item shape, which replaces the
 * static `items`.
 */
export interface BlockItemsSource {
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Title of the empty state, when there is nothing to show. */
  emptyLabel?: string;
  /**
   * How many placeholder rows, cells or cards the block draws while
   * `fetchUrl` loads. The block cannot know the length of a list it has not
   * read yet: set it to the length the route usually answers, so the block
   * keeps its height when the items land. A count, not a height, so it holds
   * at every width.
   *
   * Optional. Defaults to `columns`, or 4 (StatStrip); 5 (KeyValueList);
   * `columns`, or 3 (NavCardGrid).
   */
  skeletonCount?: number;
}

export const blockItemsSourceOptions = () => ({
  fetchUrl: ui(
    z
      .string()
      .optional()
      .describe(
        "Route answering `{ items }`; when set it replaces the static items.",
      ),
    { label: "Data source", group: "data", widget: "url", advanced: true },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  }),
  emptyLabel: ui(
    z.string().optional().describe("Shown when there is nothing to list."),
    { label: "Empty message", group: "content" },
  ),
  skeletonCount: ui(
    z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Placeholder items drawn while the data source loads."),
    {
      label: "Loading placeholders",
      group: "data",
      widget: "number",
      min: 1,
      advanced: true,
    },
  ),
});
