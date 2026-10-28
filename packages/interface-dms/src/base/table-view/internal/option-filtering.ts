/** @internal @packageDocumentation */

/**
 * How much a table draws around its rows.
 *
 * - `"full"`: the dashboard grid — caption and count, a search button,
 *   filters, sort, refresh, the ⋯ table menu, column header menus and a
 *   footer with the page size picker.
 * - `"compact"`: the list of a settings page — tabs, an always-open search
 *   field, quick filters, custom buttons and a footer with the page size
 *   picker; no caption, filters row, sort menu, refresh, ⋯ menu nor column
 *   menus.
 *
 * Either way a control shows only when it means something: the search when
 * the controller has `@Searchable` fields, the filters when a column is
 * `filterable`, the caption when `caption` is set, the export entry when the
 * caller may export.
 */
export type TableViewLayout = "full" | "compact";

/** How a quick filter compares its column with the picked value. */
export type TableViewQuickFilterMode =
  | "is"
  | "is_not"
  | "include"
  | "exclude"
  | "array_contains_string";

/**
 * A one-click filter drawn in the toolbar as a dropdown button listing the
 * values of a column: a select's items, a boolean's two labels, a tags
 * column's `suggestions`, or the rows a relation points to. The picked value
 * is the column's filter, the very one the filters row edits: kept with the
 * table's state, counted as an active filter and cleared by "Reset filters".
 * In the `compact` layout, which has no filters row, the button names the
 * column and its value ("Role: Admin") next to a clear button.
 */
export interface TableViewQuickFilter {
  /** Filterable column the control filters on. */
  field: string;
  /** Button text while no value is picked; defaults to the column name. */
  label?: string;
  /** Button icon; defaults to a funnel. */
  icon?: string;
  /** Text of the entry that clears the filter; defaults to "All". */
  allLabel?: string;
  /**
   * Compare mode of the filter. Defaults to `array_contains_string` for a
   * multiple relation or select and for a type whose default compare mode it
   * is (tags), `is` otherwise.
   */
  mode?: TableViewQuickFilterMode;
}

/**
 * How the rows beyond the first page are reached: a pager (`pages`), a
 * "Load more" button appending the next page (`loadMore`), or the next page
 * appended as the end of the list scrolls into view (`infinite`, a feed).
 */
export type TableViewPaginationMode = "pages" | "loadMore" | "infinite";

/**
 * Rows the user orders by hand: a drag handle (or the arrow keys on it)
 * moves a row, and the rows it moved get a new value of `field`. The handle
 * shows on the grid and on the `cards` display (in front of each row, on
 * each card), to a caller who may edit the rows.
 */
export interface TableViewReorderOptions {
  /**
   * The number column holding a row's position, `@Sortable()` and
   * writable: the rows are listed sorted on it.
   */
  field: string;
}

export interface QueryParamFilter {
  field: string;
  mode?: string;
  /**
   * Shows the filter, while the URL applies it, as a chip of the filters row
   * that the user can remove (which drops the parameter from the URL). Off by
   * default: the filter stays hidden and cannot be cleared.
   */
  visible?: boolean;
  /**
   * Names the chip of a `visible` filter (a `$`-prefixed key is translated).
   * Defaults to the label of the `field` column, else the parameter's name.
   */
  label?: string;
}

export type QueryParamFilters = Record<string, QueryParamFilter>;

export interface RouteParamFilter {
  field: string;
  mode?: string;
}

export type RouteParamFilters = Record<string, RouteParamFilter>;
