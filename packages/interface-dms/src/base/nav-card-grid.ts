import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { type BlockItemsSource, blockItemsSourceOptions } from "./display";
import { toneEnum } from "./internal/display";
import { TONES, type Tone, ICON_TONES, type IconTone } from "./types/tone";
import type { BaseComponentProps } from "./types";
import type { CategoryInfo } from "../page/types";

/** One navigation card. */
export interface NavCardItem {
  /** Stable key; the target is used without one. */
  id?: string;
  /** `$`-prefixed for an i18n key, like every text of the card. */
  title: string;
  description?: string;
  icon: string;
  iconTone?: IconTone;
  /** Route, `#anchor` or URL. */
  to: string;
  /** Live state of the target, in mono at the bottom ("3 unread"). */
  state?: string;
  /** Tone of the state line (`neutral` = dimmed). */
  stateTone?: Tone;
  /** Small uppercase tag after the title (the module a page comes from). */
  tag?: string;
  /** Mono readout lines under the description. */
  readout?: string[];
}

/** The options `NavCardGrid` takes. */
export interface NavCardGridProps extends BaseComponentProps, BlockItemsSource {
  items?: NavCardItem[];
  /**
   * Full id of a category: a card per page of it the viewer can open, in
   * menu order, each with its navigation badge — in place of `items` and
   * `fetchUrl`. Set through the `category` option.
   */
  categoryId?: string;
  /** Columns on wide screens (1–4); fewer on narrow ones. */
  columns?: number;
  /** Section title above the grid. */
  title?: string;
  description?: string;
}

const NAV_CARD_GRID_COMPONENT_NAME = "dms-nav-card-grid-block";
const NAV_CARD_GRID_ICON = "i-ph-cards";
const NAV_CARD_GRID_DEFAULT_COLUMNS = 3;

/**
 * NavCardGrid — a grid of navigation cards: icon, title, description, and
 * optionally the target's live state, a tag or a mono readout.
 *
 * The cards are items of one block rather than blocks of their own: a grid of
 * nav cards is one list (a settings overview, a module home), configured in
 * one place, reflowed as one grid, and — with `fetchUrl` — fed by one route
 * that computes every card's state. A single card is a one-item grid.
 *
 * @example
 * ```typescript
 * NavCardGrid({
 *   title: "Workspace",
 *   items: [
 *     { icon: "i-ph-users", title: "Members", to: "/settings/workspace/members",
 *       state: "8 of 10 seats" },
 *   ],
 * })
 * ```
 */
/** What `NavCardGrid` takes: its options, the category being given whole. */
export interface NavCardGridOptions extends Omit<
  NavCardGridProps,
  "categoryId"
> {
  /**
   * The category whose pages the cards stand for: a card per page the viewer
   * can open, with the badge its navigation entry shows. A settings overview
   * lists its sections this way, a module's home its pages. A viewer who can
   * open none of them gets no grid at all, title included, unless `empty`
   * says what to show instead.
   */
  category?: CategoryInfo;
}

export function NavCardGrid(
  options?: NavCardGridOptions,
): ComponentBuilder<NavCardGridProps> {
  const { category, ...rest } = options ?? {};
  const props: NavCardGridProps = {
    columns: NAV_CARD_GRID_DEFAULT_COLUMNS,
    ...rest,
  };
  if (category) props.categoryId = category.fullId;
  return new ComponentBuilder<NavCardGridProps>(NAV_CARD_GRID_COMPONENT_NAME)
    .options(props)
    .meta({
      name: options?.title || "Navigation cards",
      icon: NAV_CARD_GRID_ICON,
    });
}

const NavCardItemSchema = z.object({
  id: ui(z.string().optional(), { label: "Key", advanced: true }),
  title: ui(z.string(), { label: "Title" }),
  description: ui(z.string().optional(), {
    label: "Description",
    widget: "textarea",
  }),
  icon: ui(z.string(), { label: "Icon", widget: "icon" }),
  iconTone: ui(toneEnum(ICON_TONES).optional(), {
    label: "Icon tone",
    widget: "select",
  }),
  to: ui(z.string().describe("Route, `#anchor` or URL."), {
    label: "Link",
    widget: "url",
  }),
  state: ui(z.string().optional(), { label: "State" }),
  stateTone: ui(toneEnum(TONES).optional(), {
    label: "State tone",
    widget: "select",
  }),
  tag: ui(z.string().optional(), { label: "Tag" }),
  readout: ui(z.array(z.string()).optional(), { label: "Readout lines" }),
}) satisfies BlockOptionsFor<NavCardItem>;

/** The options `NavCardGrid` accepts. */
export const NavCardGridSchema = z.object({
  title: ui(z.string().optional().describe("Section title above the grid."), {
    label: "Title",
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  items: ui(
    z.array(NavCardItemSchema).optional().describe("The cards, in order."),
    { label: "Cards", group: "content" },
  ),
  columns: ui(
    z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(NAV_CARD_GRID_DEFAULT_COLUMNS)
      .describe("Columns on wide screens."),
    { label: "Columns", group: "layout", widget: "number", min: 1, max: 4 },
  ),
  categoryId: ui(
    z
      .string()
      .optional()
      .describe(
        "Full id of a category: a card per page of it the viewer can open, instead of the cards above.",
      ),
    { label: "Pages of category", group: "content", advanced: true },
  ),
  ...blockItemsSourceOptions(),
}) satisfies BlockOptionsFor<NavCardGridProps>;

RegisterBlockType({
  type: "NavCardGrid",
  componentName: NAV_CARD_GRID_COMPONENT_NAME,
  schema: NavCardGridSchema,
  meta: {
    name: "Navigation cards",
    icon: NAV_CARD_GRID_ICON,
    description: "Grid of cards linking to other pages, with their state.",
    group: "content",
  },
});
