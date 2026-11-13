import { InterfaceFunction } from "@antelopejs/interface-core";
import type { BlockPath, PageRef } from "./addressing";
import type { MutationOpts, OpResult } from "./results";

/** The displays a table page can offer: the grid, a board, a card per row, rows under group headers. */
export type TableDisplayId = "table" | "kanban" | "cards" | "grouped";

/**
 * A board of cards, one column per value of a single-choice column: a select that is not
 * multiple, a boolean or a status.
 */
export interface KanbanSetting {
  /** A single-choice column of the table. */
  groupBy: string;
  /** Cards move between columns by drag and drop. Default true. */
  draggable?: boolean;
}

/** The grid with a header row per group of rows. */
export interface GroupedSetting {
  /** A sortable column of the table. `day` and `week` need a date column. */
  groupBy: string;
  by?: "value" | "day" | "week";
  /** A click on a group header folds its rows. */
  collapsible?: boolean;
  /** Group headers show how many rows they hold; needs a filterable `groupBy`. */
  count?: boolean;
}

/** A card per row: its title, then these columns. */
export interface CardsSetting {
  /** Listable columns of the table shown under the card's title; the first few when left out. */
  fields?: string[];
}

/** How a view compares a column with its value. */
export type ViewFilterMode =
  | "is"
  | "is_not"
  | "include"
  | "exclude"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "greater_than_or_equal_to"
  | "less_than_or_equal_to"
  | "is_empty"
  | "is_not_empty";

/** One filter of a view. A value may hold the tokens `{{user.id}}`, `{{now}}` and `{{now-7d}}`. */
export interface ViewFilterSetting {
  /** A filterable column of the table. */
  column: string;
  /** Default `is`. */
  mode?: ViewFilterMode;
  /** A list is joined with commas. Not needed for `is_empty` and `is_not_empty`. */
  value?: string | string[];
}

/** A named state of the table: the rows and the way they are drawn. */
export interface ViewSetting {
  /** Stable, lower-case, used in the URL: `late-orders`. */
  id: string;
  label: string;
  icon?: string;
  /** Shows how many rows the view lists. */
  count?: boolean;
  filters?: ViewFilterSetting[];
  search?: string;
  /** The rows are sorted on the first entry. Sortable columns only. */
  sort?: { column: string; desc?: boolean }[];
  columns?: { visible?: string[]; hidden?: string[]; order?: string[] };
  /** One of the displays the table offers. */
  display?: TableDisplayId;
  density?: "default" | "compact";
}

/** The named views of a table. */
export interface ViewsSetting {
  items: ViewSetting[];
  /** Where the views are drawn. Default `tabs`. */
  layout?: "tabs" | "strip" | "menu";
  /** The id of the view opened on arrival. */
  defaultView?: string;
  /** Users may save the current state as a view of their own. */
  userViews?: boolean;
}

/** A figure of the footer band, computed over every row the table's filters list. */
export interface FooterSummarySetting {
  /** Shown before the figure: `Total`. */
  label: string;
  /** `sum` adds up a number or price column; `count` counts the rows. */
  op: "sum" | "count";
  /** The column summed. Required by `sum`. */
  field?: string;
  /** Only the rows where `column` compares to `value` are summed or counted. */
  where?: {
    column: string;
    op: "equals" | "notEquals" | "in" | "notIn";
    value: string | number | boolean | (string | number | boolean)[];
  };
}

/** The footer band of a table. */
export interface FooterSetting {
  /** Replaces the footer's figures. An empty list removes them. */
  summary?: FooterSummarySetting[];
}

/**
 * What to set on a table page. A key left out is left as the page has it; `null` removes it.
 * Column names are the controller's, as `GetResourceStructure` lists them.
 */
export interface TableViewSettings {
  kanban?: KanbanSetting | null;
  grouped?: GroupedSetting | null;
  /** Offers the cards display. `null` stops offering it. */
  cards?: CardsSetting | null;
  /** The display shown first, one the table offers. `null` goes back to the first offered. */
  defaultDisplay?: TableDisplayId | null;
  views?: ViewsSetting | null;
  footer?: FooterSetting | null;
}

/** Options for `ConfigureTableView`. */
export interface ConfigureTableViewOpts extends MutationOpts {
  /** The name of the TableView block when the page holds several. */
  block?: string;
}

/**
 * Sets displays, named views and footer figures on the TableView of a page, checking each
 * against the columns of the table it reads: a kanban needs a single-choice column, a sum a
 * number or price column, a view's filters filterable columns and its sort sortable ones. A
 * footer figure also mounts the controller's summary route when it does not serve it. Nothing
 * is written when a choice is refused, or when the page would not typecheck.
 */
export const ConfigureTableView =
  InterfaceFunction<
    (
      page: PageRef,
      settings: TableViewSettings,
      opts?: ConfigureTableViewOpts,
    ) => Promise<OpResult<{ path: BlockPath }>>
  >();
