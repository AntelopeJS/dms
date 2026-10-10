import { z } from "zod";
import { type BlockOptionsFor, ui } from "./block-registry";
import type { EnumOption } from "./types/enum-option";
import { HttpMethod } from "./types/http";
import { type Tone, TONES } from "./types/tone";
import { toneEnum } from "./internal/display";

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

/**
 * The `fetchUrl` option of a block, picked in the editor's source list.
 * `periodOption` names the block's option holding the period scope the
 * source follows, for a block that can follow one.
 */
export const blockFetchUrlOption = (
  description: string,
  periodOption?: string,
) =>
  ui(z.string().optional().describe(description), {
    label: "Data source",
    group: "data",
    widget: "dataSource",
    advanced: true,
    ...(periodOption ? { periodOption } : {}),
  });

/** The `periodScope` option of a block whose data source follows a period. */
export const blockPeriodScopeOption = () =>
  ui(
    z
      .string()
      .optional()
      .describe("Id of the PeriodSelector driving this block."),
    { label: "Period scope", group: "advanced" },
  );

/** The `realtimeTopic` option of a block that refetches on realtime events. */
export const blockRealtimeTopicOption = () =>
  // A topic is a name the backend publishes under, which only its code knows.
  ui(
    z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Topics whose events make the block read its data again."),
    { label: "Realtime topics", group: "data", advanced: true },
  );

/** The `fetchUrlMethod` option that goes with `fetchUrl`. */
export const blockFetchUrlMethodOption = () =>
  ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  });

/**
 * The options a list block (StatGroup, KeyValueList, NavCardGrid,
 * ActivityFeed) reads its items from a route with. The route answers
 * `{ items: [...] }` in the block's own item shape, which replaces the static
 * `items`.
 */
export interface BlockItemsSource {
  /**
   * The route the items are read from. It may name the page it is shown on:
   * `{{params.X}}` is filled with the route parameter `X` of the page URL
   * (`{{params.id}}` on a detail page whose slug is `:id`; `{{params.id:1}}`
   * for the first of a repeated name), `{{query.X}}` with its query parameter
   * `X`. The block reads it again when they change, and requests nothing
   * while a token has no value: it shows its empty state instead.
   *
   * Read again, keeping the items on screen, when the page asks its blocks to
   * refresh: see {@link BlockFunctions.REFRESH_PAGE}.
   */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /**
   * Id of the `PeriodSelector` the items follow: `fetchUrl` is requested with
   * the selected period (`from`, `to`, `preset`, `comparison`, and
   * `compareFrom` / `compareTo` when comparing), and again when it changes,
   * as for a `KpiCard`.
   */
  periodScope?: string;
  /**
   * Topics the backend publishes on (`PublishMessage`) when the items change:
   * the block reads `fetchUrl` again on each event, keeping the items on
   * screen. The page registers them, as for a chart's `realtimeTopic`.
   */
  realtimeTopic?: string | string[];
  /** Shown when there is nothing to list. */
  empty?: BlockEmptyText;
  /**
   * How many placeholder rows, cells or cards the block draws while
   * `fetchUrl` loads. The block cannot know the length of a list it has not
   * read yet: set it to the length the route usually answers, so the block
   * keeps its height when the items land. A count, not a height, so it holds
   * at every width.
   *
   * Optional. Defaults to `columns`, or 4 (StatGroup); 5 (KeyValueList);
   * `columns`, or 3 (NavCardGrid); `maxItems`, or 3 (ActivityFeed).
   */
  skeletonCount?: number;
}

const PERIOD_SCOPE_OPTION = "periodScope";

/** The options of `BlockItemsSource`, for a list block's schema. */
export const blockItemsSourceOptions = () => ({
  fetchUrl: blockFetchUrlOption(
    "Route answering `{ items }`; when set it replaces the static items.",
    PERIOD_SCOPE_OPTION,
  ),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  periodScope: blockPeriodScopeOption(),
  realtimeTopic: blockRealtimeTopicOption(),
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

/**
 * The watch functions every block can name in `.watch()`.
 *
 * `REFRESH_PAGE` asks every block of the page that reads its data from a
 * route (StatGroup, KeyValueList, NavCardGrid, ActivityFeed, KpiCard,
 * TopListCard, Meter, Banner, the charts, a `Tab`'s `badgesUrl`) to read it
 * again, without remounting it: a form changing the record a detail page shows
 * declares `.watch(FormEvents.SUBMIT_SUCCESS, BlockFunctions.REFRESH_PAGE)`.
 * The page header's buttons do it on their own once they changed something,
 * and a frontend component calls `refreshPageBlocks()` for the same effect.
 */
export namespace BlockFunctions {
  export const REFRESH_PAGE = "DmsComponent.Block.RefreshPage";
}

declare module "./types/watch" {
  interface WatchFunctionParamMap {
    [BlockFunctions.REFRESH_PAGE]: undefined;
  }
}
