import { z } from "zod";
import { type BlockOptionsFor, ui } from "./block-registry";
import type { EnumOption } from "./types/enum-option";
import { HttpMethod } from "./types/http";
import { resolveToneAlias, type Tone, TONES } from "./types/tone";

/**
 * Shared vocabulary of the display blocks — StatStrip, KeyValueList,
 * NavCardGrid, EmptyState, Banner, Card, Meter, ActivityFeed: the tones they
 * read, the link buttons they offer, the data source and the empty state of a
 * list block.
 */

/**
 * A zod enum of tones that also reads the deprecated tone names, so a page
 * saved with `accent` keeps its colour.
 *
 * @internal
 */
export const toneEnum = <T extends readonly [string, ...string[]]>(tones: T) =>
  z.preprocess(resolveToneAlias, z.enum(tones)) as z.ZodEffects<
    z.ZodEnum<[T[number], ...T[number][]]>,
    T[number],
    T[number]
  >;

/** The button variants a block link action may take. */
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
  color?: Tone;
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
  color: ui(toneEnum(TONES).optional(), {
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

/** What a block shows when it has nothing to list. */
export interface BlockEmptyText {
  /** `$`-prefixed for an i18n key, like `description`. */
  title: string;
  description?: string;
}

/** The `empty` option of a block. */
export const blockEmptyOption = () =>
  ui(
    z
      .object({
        title: ui(z.string(), { label: "Title" }),
        description: ui(z.string().optional(), {
          label: "Description",
          widget: "textarea",
        }),
      })
      .optional()
      .describe("Shown when there is nothing to list."),
    { label: "Empty state", group: "content" },
  );

/**
 * The `card` option of a block: the card surface around it, `isOnByDefault`
 * or not. Turn it off to nest the block in a `Card`.
 */
export const blockCardOption = (isOnByDefault: boolean) =>
  ui(
    z
      .boolean()
      .default(isOnByDefault)
      .describe("Card surface around the block; off inside a `Card`."),
    { label: "In a card", group: "appearance", widget: "switch" },
  );

/** The `fetchUrl` option of a block, picked in the editor's source list. */
export const blockFetchUrlOption = (description: string) =>
  ui(z.string().optional().describe(description), {
    label: "Data source",
    group: "data",
    widget: "dataSource",
    advanced: true,
  });

/** The `fetchUrlMethod` option that goes with `fetchUrl`. */
export const blockFetchUrlMethodOption = () =>
  ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  });

/**
 * The options a list block (StatStrip, KeyValueList, NavCardGrid,
 * ActivityFeed) reads its items from a route with. The route answers
 * `{ items: [...] }` in the block's own item shape, which replaces the static
 * `items`.
 */
export interface BlockItemsSource {
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Shown when there is nothing to list. */
  empty?: BlockEmptyText;
  /**
   * How many placeholder rows, cells or cards the block draws while
   * `fetchUrl` loads. The block cannot know the length of a list it has not
   * read yet: set it to the length the route usually answers, so the block
   * keeps its height when the items land. A count, not a height, so it holds
   * at every width.
   *
   * Optional. Defaults to `columns`, or 4 (StatStrip); 5 (KeyValueList);
   * `columns`, or 3 (NavCardGrid); `maxItems`, or 3 (ActivityFeed).
   */
  skeletonCount?: number;
}

/** The options of `BlockItemsSource`, for a list block's schema. */
export const blockItemsSourceOptions = () => ({
  fetchUrl: blockFetchUrlOption(
    "Route answering `{ items }`; when set it replaces the static items.",
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  empty: blockEmptyOption(),
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
