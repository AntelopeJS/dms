import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import {
  blockFetchUrlMethodOption,
  blockPeriodScopeOption,
  blockRealtimeTopicOption,
} from "./display";
import { type EmptyStateProps, EmptyStateSchema } from "./empty-state";
import type { EnumOption } from "./types/enum-option";
import type { HttpMethod } from "./types/http";

const GRID_COMPONENT_NAME = "dms-grid";
const GRID_ROW_COMPONENT_NAME = "dms-grid-row";
const GRID_DEFAULT_GAP = "1rem";
const GRID_DEFAULT_MIN_COLUMN_WIDTH = "240px";

/** The empty state a grid shows in place of its rows: an `EmptyState`'s options. */
export type GridEmptyState = Omit<EmptyStateProps, "watchActions">;

/**
 * When a grid swaps all its rows for one empty state, as the data says: a
 * route with no traffic over the period shows "No calls yet" and a link to
 * call it, rather than a page of empty charts. See `GridOptions.emptyWhen`.
 */
export interface GridEmptyWhen {
  /**
   * The route read, answering a JSON object. It takes the tokens of a block's
   * `fetchUrl` (`{{params.X}}`, `{{query.X}}`), and nothing is requested while
   * one has no value: the rows show.
   */
  fetchUrl: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Id of the `PeriodSelector` the route is read with, again on each change. */
  periodScope?: string;
  /** Topics whose events make the grid read the route again. */
  realtimeTopic?: string | string[];
  /**
   * Dot path of the value in the answer (`calls`, `summary.calls`). The grid
   * is empty when it is absent, `null`, `false`, `0`, `""` or `[]`.
   */
  field: string;
  /**
   * What the grid shows then. An `emptyState` object in the answer is laid
   * over it, for a text or a link only the route knows (when the record was
   * last used, a link carrying its id).
   */
  emptyState: GridEmptyState;
}

/**
 * Options for Grid component
 */
export interface GridOptions {
  /**
   * Gap between rows and columns (CSS unit)
   * @default '1rem'
   */
  gap?: string;
  /**
   * Width below which a column is dropped rather than squeezed (CSS length).
   * The grid keeps as many columns as the available width affords at this
   * floor, up to the widest row's child count, so a row that does not fit
   * wraps instead of overflowing.
   * @default '240px'
   */
  minColumnWidth?: string;
  /**
   * Reads a route and, when the value it names is empty, shows one
   * `EmptyState` across the grid instead of its rows. The rows show while the
   * route loads, when it fails, and once the value is set again.
   */
  emptyWhen?: GridEmptyWhen;
}

const GridEmptyWhenSchema = z.object({
  fetchUrl: ui(z.string().describe("Route answering a JSON object."), {
    label: "Data source",
  }),
  fetchUrlMethod: blockFetchUrlMethodOption(),
  periodScope: blockPeriodScopeOption(),
  realtimeTopic: blockRealtimeTopicOption(),
  field: ui(
    z.string().describe("Dot path of the value; empty when falsy or `[]`."),
    { label: "Field" },
  ),
  emptyState: ui(EmptyStateSchema, { label: "Empty state" }),
}) satisfies BlockOptionsFor<GridEmptyWhen>;

/** The options `Grid` accepts. */
export const GridSchema = z.object({
  gap: ui(
    z
      .string()
      .default(GRID_DEFAULT_GAP)
      .describe("Gap between rows and columns, as a CSS length."),
    { label: "Gap", group: "layout" },
  ),
  minColumnWidth: ui(
    z
      .string()
      .default(GRID_DEFAULT_MIN_COLUMN_WIDTH)
      .describe("Width below which a column is dropped, as a CSS length."),
    { label: "Minimum column width", group: "layout" },
  ),
  emptyWhen: ui(
    GridEmptyWhenSchema.optional().describe(
      "Shows one empty state instead of the rows when a route says so.",
    ),
    { label: "Empty when", group: "data", advanced: true },
  ),
}) satisfies BlockOptionsFor<GridOptions>;

/**
 * Metadata a row's child carries to widen itself across columns. It belongs to
 * `GridRow` alone: a row is pinned to the full width (`1 / -1`), so a span on
 * the row itself would be inert.
 */
export const GridChildSchema = z.object({
  colSpan: ui(
    z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Number of columns the child spans."),
    { label: "Column span", group: "layout", widget: "number", min: 1 },
  ),
});

/**
 * Grid - Responsive Grid Container
 *
 * A grid container that automatically calculates the number of columns based on
 * the maximum number of children in any row. Each GridRow child will be rendered
 * as a row in the grid.
 *
 * The column count is an upper bound, not a fixed value: columns narrower than
 * `minColumnWidth` are dropped, so on a narrow viewport a row wraps onto
 * several lines instead of overflowing. Rows share one template, so they stay
 * aligned on one another at every width.
 *
 * @example
 * ```typescript
 * Grid({ gap: '1rem' })
 *   .child('row1', GridRow()
 *     .child('col1', Card(...))
 *     .child('col2', Card(...))
 *   )
 *   .child('row2', GridRow()
 *     .child('col1', Card(...))
 *   )
 *
 * // One empty state instead of empty charts while the route has no calls.
 * Grid({
 *   emptyWhen: {
 *     fetchUrl: '/api/routes/activity?route={{query.route}}', // { calls: 0 }
 *     field: 'calls',
 *     emptyState: { title: 'No calls yet', icon: 'i-ph-moon-stars' },
 *   },
 * })
 * ```
 */
export function Grid(options?: GridOptions): ComponentBuilder<GridOptions> {
  return new ComponentBuilder<GridOptions>(GRID_COMPONENT_NAME)
    .options({
      gap: GRID_DEFAULT_GAP,
      minColumnWidth: GRID_DEFAULT_MIN_COLUMN_WIDTH,
      ...options,
    })
    .meta({
      name: "Grid",
      icon: "i-ph-grid-four",
      description:
        "Responsive grid container with automatic column calculation",
    });
}

/**
 * GridRow - Grid Row Component
 *
 * Represents a single row in a Grid. All children of a GridRow will be laid out
 * horizontally within that row, with equal spacing.
 *
 * @example
 * ```typescript
 * GridRow()
 *   .child('item1', Card(...))
 *   .child('item2', Card(...))
 * ```
 */
export function GridRow(): ComponentBuilder {
  return new ComponentBuilder<unknown>(GRID_ROW_COMPONENT_NAME).meta({
    name: "GridRow",
    icon: "i-ph-rows",
    description: "Row within a grid container",
  });
}

RegisterBlockType({
  type: "Grid",
  componentName: GRID_COMPONENT_NAME,
  schema: GridSchema,
  container: true,
  allowedChildren: ["GridRow"],
  meta: {
    name: "Grid",
    icon: "i-ph-grid-four",
    description: "Responsive grid container laid out in rows.",
    group: "layout",
  },
});

RegisterBlockType({
  type: "GridRow",
  componentName: GRID_ROW_COMPONENT_NAME,
  container: true,
  childMeta: GridChildSchema,
  meta: {
    name: "Grid row",
    icon: "i-ph-rows",
    description: "Row of a grid; its children are the columns.",
    group: "layout",
  },
});
