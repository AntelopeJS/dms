import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";

const GRID_COMPONENT_NAME = "dms-grid";
const GRID_ROW_COMPONENT_NAME = "dms-grid-row";
const GRID_DEFAULT_GAP = "1rem";

/**
 * Options for Grid component
 */
export interface GridOptions {
  /**
   * Gap between rows and columns (CSS unit)
   * @default '1rem'
   */
  gap?: string;
}

/** The options `Grid` accepts. */
export const GridSchema = z.object({
  gap: ui(
    z
      .string()
      .default(GRID_DEFAULT_GAP)
      .describe("Gap between rows and columns, as a CSS length."),
    { label: "Gap", group: "layout" },
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
 * @example
 * ```typescript
 * Grid({ gap: '1rem' })
 *   .child('row1', GridRow()
 *     .child('col1', Tree(...))
 *     .child('col2', Tree(...))
 *   )
 *   .child('row2', GridRow()
 *     .child('col1', Tree(...))
 *   )
 * ```
 */
export function Grid(options?: GridOptions): ComponentBuilder<GridOptions> {
  return new ComponentBuilder<GridOptions>(GRID_COMPONENT_NAME)
    .options({
      gap: GRID_DEFAULT_GAP,
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
 *   .child('item1', Tree(...))
 *   .child('item2', Tree(...))
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
