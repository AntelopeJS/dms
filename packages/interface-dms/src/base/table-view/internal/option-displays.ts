/** @internal @packageDocumentation */
import type { Component, ComponentInfoSerialized } from "../../../component";

/**
 * The card the `kanban` and `cards` displays draw for each row. Left out,
 * a card shows the row's label and its first few listable columns (on the
 * board, besides the one it groups on).
 */
export interface TableViewCardOptions {
  /**
   * Columns shown on the card below its title (`labelKey`), each value
   * drawn like a cell: through its column's `display`, else its data type.
   */
  fields?: string[];
  /**
   * Frontend component drawing the whole card, resolved by name from the
   * global registry; its directory must be declared globally. Both displays
   * hand it the same props: `row`, `rowId`, `columns`, `labelKey`, `actions`
   * (the table's row actions), `selected` and `select(value?)` (the row's
   * selection), and `open()` (what a click on the row does). The kanban adds
   * `groupValue`, the value of the column the card sits in; the `cards`
   * display of a hand-ordered table (`reorder`) adds `reorder`, the card's
   * move handle (`{ enabled, dragging, handle }`, `handle` bound with
   * `v-bind` on a button).
   */
  component?: Component;
  /**
   * `cards` display only: the narrowest a card gets, as a CSS length
   * (`"300px"`, `"20rem"`). Defaults to `"230px"`. The row fits as many
   * cards of that width as it can and stretches them to fill it; a list too
   * short to fill a row stretches its cards up to twice that width.
   */
  minWidth?: string;
  /**
   * `cards` display only: the height of a placeholder card while the page
   * loads, as a CSS length (`"260px"`). Left out, a placeholder is as tall as
   * the built-in card. A `component` taller than that sets it to its own
   * height, so the pagination footer below the grid stands where the loaded
   * cards put it. The cards themselves keep their own height.
   */
  skeletonHeight?: string;
}

/** The card of the `kanban` and `cards` displays as it reaches the client. */
export interface TableViewCardOptionsSerialized {
  fields?: string[];
  component?: ComponentInfoSerialized;
  minWidth?: string;
  skeletonHeight?: string;
}

/** The kanban options as its display entry carries them. */
export interface KanbanOptionsSerialized extends Omit<KanbanOptions, "card"> {
  card?: TableViewCardOptionsSerialized;
}

export interface TableViewDisplayCapabilities {
  columnManagement?: boolean;
  filters?: boolean;
  search?: boolean;
  sorting?: boolean;
  tabs?: boolean;
  /**
   * Whether the table keeps its own chrome (caption, toolbar, tabs, filters
   * row, bulk bar) around a display that draws a complete interface itself.
   * Defaults to true.
   */
  header?: boolean;
}

/**
 * A display a table view offers besides its grid: a built-in one by its id
 * (`"cards"`), or a module's, named `<module>:<id>` (`"saas:plan-cards"`) and
 * registered on the frontend with `registerTableViewDisplay`.
 */
export interface TableViewDisplayOption {
  id: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Display plugins own their option schemas.
  options?: Record<string, unknown>;
  component?: Component;
  selfManagedData?: boolean;
  capabilities?: TableViewDisplayCapabilities;
}

export interface TableViewDisplayOptionSerialized extends Omit<
  TableViewDisplayOption,
  "component"
> {
  component?: ComponentInfoSerialized;
}

export interface KanbanOptions {
  /**
   * Field used to group cards into kanban columns. Must be declared as a
   * @Column with a non-multiple SelectType (one column per item), a
   * BooleanType (two columns), or a StatusType (one column per status). This
   * is the default; users can switch to any other eligible field from the
   * board.
   */
  groupByField: string;
  /**
   * Allow dragging cards between columns to update the group field.
   * Defaults to true.
   */
  draggable?: boolean;
  /**
   * CSS max-height of a kanban column card list before it scrolls
   * (e.g. "60vh", "480px"). Defaults to "60vh". The number of items fetched
   * per column follows the user-adjustable table page size preference.
   */
  columnMaxHeight?: string;
}

/** How the `grouped` display cuts the rows into groups. */
export type TableViewGroupBy = "value" | "day" | "week";

/**
 * The `grouped` display: the table's own columns, with a header row before
 * each group of rows sharing a value of `groupByField` (a status, a day of a
 * date). The rows are listed sorted on that column and paged as usual, and a
 * page starting inside a group repeats its header on top. No aggregates.
 */
export interface GroupedOptions {
  /**
   * Column the rows are grouped on. It must be a `@Sortable()` column: the
   * list sorts on it so a group's rows follow each other.
   */
  groupByField: string;
  /**
   * `value` (the default): one group per value; `day` or `week`: one group
   * per calendar day or week of a date column.
   */
  by?: TableViewGroupBy;
  /** A click on a group header folds its rows. */
  collapsible?: boolean;
  /** Group headers show how many rows the group holds. */
  count?: boolean;
}
