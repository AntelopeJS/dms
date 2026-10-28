/** @internal @packageDocumentation */
import type { Component, ComponentInfoSerialized } from "../../../component";

/** A field of the expanded row's detail band. */
export interface TableViewExpandableField {
  /** Column key; the value renders through that column's data type. */
  key: string;
  /** Label shown instead of the column's name. `$`-prefixed: an i18n key. */
  label?: string;
}

/** Which rows open on arrival and after the listed set changes. */
export type TableViewExpandedDefault = "none" | "first" | "all";

/** How expandable rows open, whatever their band shows. */
export interface TableViewExpandableBehavior {
  /**
   * Rows open when the table loads and whenever a new page, filter, search,
   * sort, tab or archive view is listed. Defaults to "none".
   */
  defaultExpanded?: TableViewExpandedDefault;
  /** Keep at most one row open: opening a row closes the previous one. */
  single?: boolean;
  /**
   * Load the row again when it opens, from the data API's `get` route, and
   * show the band with that answer: the band can then show fields the list
   * does not return. The band shows a placeholder while it loads and an
   * error with a retry if it fails. Kept until the listed rows reload. Not
   * for a table on a `source`, which has no `get` route.
   */
  lazyLoad?: boolean;
}

/** A detail band listing columns of the row as a label/value list. */
export interface TableViewExpandableFields extends TableViewExpandableBehavior {
  /**
   * Columns listed in the band, each value rendered with its column's data
   * type. A column must be listable to carry a value, unless `lazyLoad`
   * reads the row from `get`; hide it from the grid with `isVisible: false`
   * on its `@Column` to show it only here.
   */
  fields: Array<string | TableViewExpandableField>;
  /** Eyebrow above the field list. `$`-prefixed: an i18n key. */
  fieldsLabel?: string;
  component?: never;
}

/** A detail band drawn entirely by a frontend component. */
export interface TableViewExpandableComponent extends TableViewExpandableBehavior {
  /**
   * Frontend component rendered as the whole band, resolved by name from the
   * global registry. It receives the row (the listed one, or the one
   * `lazyLoad` read), its id, the column metadata, the table's row actions,
   * `open` (what a click on the row does) and `refresh` (reloads the table).
   */
  component: Component;
  fields?: never;
  fieldsLabel?: never;
}

/**
 * Expandable rows: a caret column opens a detail band under the row. The band
 * shows either `fields` as a label/value list, or a `component` that replaces
 * that rendering altogether — never both.
 */
export type TableViewExpandableOptions =
  | TableViewExpandableFields
  | TableViewExpandableComponent;

/** The detail band of expandable rows as it reaches the client. */
export interface TableViewExpandableSerialized extends TableViewExpandableBehavior {
  fields?: TableViewExpandableField[];
  fieldsLabel?: string;
  component?: ComponentInfoSerialized;
}
