import type { ColumnDisplaySerialized } from "./table-view/column-display";
import type {
  ActionTarget,
  ActionTargetSerialized,
} from "./types/action-target";
import type { BlockText } from "./types/composed-text";
import type { HttpMethod } from "./types/http";
import type { Tone } from "./types/tone";
import type { BaseComponentProps, EnumOption } from "./types";

/**
 * What a cell holds, which picks the input that edits it and how it is drawn.
 * Each kind is edited with the DMS form input of the matching data type
 * (`text` → InputText, `json` → InputCode in JSON, `richText` → RichText...),
 * so a cell edits exactly like the same field in a `Form`.
 */
export const MATRIX_CELL_KINDS = [
  "text",
  "longText",
  "number",
  "boolean",
  "date",
  "datetime",
  "select",
  "tags",
  "json",
  "code",
  "richText",
  "keyValue",
  "address",
] as const;

export type MatrixCellKind = (typeof MATRIX_CELL_KINDS)[number];

/**
 * The kinds edited in a drawer by default (`editIn: "auto"`), never in the
 * cell: a value a one-line cell cannot show or take whole. A `longText` and a
 * `text` cell go to the drawer too once their value holds a line break or
 * passes {@link MATRIX_LONG_TEXT_LENGTH} characters.
 */
export const MATRIX_PANEL_KINDS: readonly MatrixCellKind[] = [
  "json",
  "code",
  "richText",
  "keyValue",
  "address",
];

/** Past this length, an `auto` text cell is edited in the drawer. */
export const MATRIX_LONG_TEXT_LENGTH = 120;

/** Where a cell is edited: in place, in a drawer holding that cell alone, or picked by its kind and value. */
export type MatrixEditIn = "cell" | "panel" | "auto";

/** How a cell enters editing. */
export type MatrixEditTrigger = "click" | "doubleClick";

/**
 * When an edit reaches the server. `immediate` writes each cell as it is left
 * (Saving → Saved, Retry on failure); `staged` keeps the edits, shows the old
 * value struck through, and writes them together from a save bar.
 */
export type MatrixSaveMode = "immediate" | "staged";

/** Where Enter moves after saving a cell. */
export type MatrixEnterMove = "down" | "right" | "stay";

/**
 * `overwrite`: the last write wins. `detect`: each change carries the value
 * the edit started from (`previous`); the route answers a conflict when the
 * stored value moved, and the cell offers Overwrite or Discard.
 */
export type MatrixConflictMode = "overwrite" | "detect";

/** How many rows the grid reads at a time. */
export type MatrixPagination = "none" | "pages" | "infinite";

/** The tones a cell, a row or a select option may take. */
export type MatrixTone = Extract<
  Tone,
  "neutral" | "primary" | "success" | "warning" | "error" | "info"
>;

/** A choice of a `select` or `tags` column. */
export interface MatrixSelectOption {
  value: string;
  label: BlockText;
  /** The pill the value is drawn as (a roster's "Off" in neutral, "Sick" in error). */
  tone?: MatrixTone;
  icon?: string;
}

/**
 * One column. Columns come from the block's `columns` option, from the
 * response's `columns`, or both: the response wins for an id both declare,
 * and adds the ones it alone names (languages of a workspace, sizes of an
 * article, fields of a collection). They are drawn in the response's order,
 * then the block's columns the response does not name, in the block's order;
 * `pinned` ones first.
 */
export interface MatrixColumn {
  id: string;
  label: BlockText;
  /** Defaults to `text`. */
  kind?: MatrixCellKind;
  icon?: string;
  /** Dimmed line under the label, also its tooltip. */
  description?: BlockText;
  /** Width in pixels. */
  width?: number;
  /** `false` keeps the column read-only in an editable grid. */
  editable?: boolean;
  /** Defaults to `auto`: see {@link MATRIX_PANEL_KINDS}. */
  editIn?: MatrixEditIn;
  /** The choices of a `select` or `tags` column. */
  options?: MatrixSelectOption[];
  /** The language of a `code` column (`sql`, `html`...). */
  language?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A `number` column taking whole numbers only (quantities). */
  integer?: boolean;
  /** Offers "Set to null"; typing `null` empties the cell. */
  nullable?: boolean;
  /** An empty value is refused before it is sent. */
  required?: boolean;
  /**
   * Left out of the totals (an annex column, a price, a rate): no part of the
   * row's Total, no sum in the Total row. Numbers count by default.
   */
  excludeFromTotals?: boolean;
  align?: "start" | "center" | "end";
  /**
   * A table view cell display drawing the value when it is not edited
   * (`DefaultDisplays.StatusPillDisplay`, a module's own display), serialized
   * as a column's `display`.
   */
  display?: ColumnDisplaySerialized;
  /**
   * Escape hatch: a module's Vue component drawing the cell, registered under
   * this name. It receives `value`, `row`, `column` and `cell`.
   */
  component?: string;
  /** A pill in the header ("Base", "12 missing"). */
  badge?: BlockText;
  badgeTone?: MatrixTone;
  /** A meter under the header, 0 to 1 (a language's coverage). */
  progress?: number;
  progressTone?: MatrixTone;
  /** Hidden until shown from the columns menu. */
  hidden?: boolean;
  /** Stuck to the left, after the row header. */
  pinned?: boolean;
}

/** What the server says about one cell, besides its value. */
export interface MatrixCellState {
  tone?: MatrixTone;
  /** A small figure in the cell's corner (the stock already there). */
  hint?: BlockText;
  /** Hatched and not editable: outside the range (a size the article lacks). */
  disabled?: boolean;
  readOnly?: boolean;
  /** Warnings shown on the cell and in its drawer (a placeholder missing). */
  issues?: BlockText[];
  /**
   * Greyed text shown while the cell is empty, and above its editor while it
   * is edited (the inherited or base text, as a reference).
   */
  placeholder?: BlockText;
  /** Overrides the column's `editIn` for this cell (a long base text edited in the drawer). */
  editIn?: MatrixEditIn;
  /** A value shown struck through before the current one (before / after). */
  previous?: unknown;
}

/** One row: a record, or one value of the vertical axis (a store, a person). */
export interface MatrixRow {
  id: string;
  /** The row header. Defaults to the id. */
  label?: BlockText;
  /** Dimmed line under the label. */
  description?: BlockText;
  /** The id of the group the row is filed under. */
  group?: string;
  /** The cells, by column id. */
  values: Record<string, unknown>;
  /** Per-cell state, by column id. */
  cells?: Record<string, MatrixCellState>;
  readOnly?: boolean;
  /** Highlights the row (the current store). */
  tone?: MatrixTone;
  /** A pill after the row label ("Overridden"). */
  badge?: BlockText;
  badgeTone?: MatrixTone;
}

/** A group heading the rows that name it. */
export interface MatrixGroup {
  id: string;
  label: BlockText;
  description?: BlockText;
  badge?: BlockText;
  badgeTone?: MatrixTone;
  /** Starts collapsed. */
  collapsed?: boolean;
}

/**
 * Expected totals, set on the block or answered by the route: a footer or a
 * total cell that differs turns red, and with `blockSave` the save waits until
 * every one matches (24 pairs received must be split into 24).
 */
export interface MatrixTargets {
  rows?: Record<string, number>;
  columns?: Record<string, number>;
  /** Checked against the grand total, drawn when `totals.rows` and `totals.columns` are both on. */
  total?: number;
  blockSave?: boolean;
  /** Said under the grid while a target is missed. */
  message?: BlockText;
}

/** A choice of a facet filter. */
export interface MatrixFacetItem {
  value: string;
  label: BlockText;
  count?: number;
}

/**
 * The answer of `fetchUrl`. It is read with `offset` and `limit` (when
 * paginated), `search`, `status`, `sort` and `direction`, and one
 * `facet_<id>=a,b` per facet in use.
 */
export interface MatrixData {
  rows: MatrixRow[];
  columns?: MatrixColumn[];
  /** Every row the query matches, for the pager. Defaults to `rows.length`. */
  total?: number;
  groups?: MatrixGroup[];
  /** The count of each status filter, by id. */
  counts?: Record<string, number>;
  /** The choices of each facet, by facet id, when the block does not list them. */
  facets?: Record<string, MatrixFacetItem[]>;
  targets?: MatrixTargets;
  /** A line in the footer ("0 missing translations in French"). */
  footer?: BlockText;
}

/** One edited cell, as `saveUrl` receives it. */
export interface MatrixChange {
  rowId: string;
  columnId: string;
  value: unknown;
  /**
   * The value the edit started from. Always sent; a route checks it only
   * under `conflicts: "detect"`, and ignores it otherwise.
   */
  previous: unknown;
}

/** The body posted to `saveUrl`. */
export interface MatrixSaveRequest {
  changes: MatrixChange[];
  /** Set when the user chose Overwrite on a conflict. */
  force?: boolean;
  /** The block's `conflicts` mode, so a generic route knows whether to check `previous`. */
  conflicts?: MatrixConflictMode;
  /**
   * The query the grid reads its rows with (`search`, `status`,
   * `facet_<id>`...), without paging, so the route can answer the `counts`
   * of the filtered view.
   */
  query?: Record<string, string>;
}

/** A change the route refused. */
export interface MatrixCellError {
  rowId: string;
  /** Absent: the error is about the whole row. */
  columnId?: string;
  message: BlockText;
}

/** A change made on a value that moved meanwhile (`conflicts: "detect"`). */
export interface MatrixConflict {
  rowId: string;
  columnId: string;
  current: unknown;
}

/**
 * The answer of `saveUrl`. Rows it returns replace theirs on screen; a change
 * named in `errors` or `conflicts` stays in its cell with the message; every
 * other change of the request counts as written, its cell keeping the value
 * sent. A route refusing the request as a whole names every change, answers
 * a row error, or answers a non-2xx, which fails every change of the request.
 * `columns`, `groups` and `footer` replace theirs (a coverage badge, a group
 * count, a footer line that the save moved).
 */
export interface MatrixSaveResponse {
  rows?: MatrixRow[];
  errors?: MatrixCellError[];
  conflicts?: MatrixConflict[];
  counts?: Record<string, number>;
  targets?: MatrixTargets;
  columns?: MatrixColumn[];
  groups?: MatrixGroup[];
  footer?: BlockText;
}

/**
 * A server-computed fill (all to the warehouse, by minimum stock, on the
 * checked stores, clear): the grid posts its rows as shown (`{ rows }`, plus
 * `selected`, the checked row ids, when the grid is `selectable`) and applies
 * the answered `{ changes }` as edits, through the save mode like typed ones.
 * A change on a cell the user cannot edit is left out; an answered `previous`
 * is ignored, the edit starting from the value on screen.
 */
export interface MatrixFillAction {
  id: string;
  label: BlockText;
  icon?: string;
  url: string;
  method?: EnumOption<HttpMethod>;
}

/**
 * A segment of the status filter ("Missing 12"), sent as `status=<id>`. The
 * grid puts an "All" segment first (no `status` sent, counted by
 * `counts.all`) unless one of the filters has the id `all`.
 */
export interface MatrixStatusFilter {
  id: string;
  label: BlockText;
  tone?: MatrixTone;
}

/** A select filter, sent as `facet_<id>=a,b`. */
export interface MatrixFacet {
  id: string;
  label: BlockText;
  icon?: string;
  multiple?: boolean;
  /** Static choices; else the response's `facets[id]`. */
  items?: MatrixFacetItem[];
}

/** An entry of the legend under the grid. */
export interface MatrixLegendItem {
  label: BlockText;
  tone?: MatrixTone;
  /** Drawn as the hatching of a disabled cell. */
  hatched?: boolean;
}

/** The row header, the sticky first column. */
export interface MatrixRowHeader {
  label?: BlockText;
  width?: number;
  /** Numbers the rows in a gutter (1, 2, 3... across pages). */
  numbers?: boolean;
}

/**
 * The drawer of a whole row, opened by the ⤢ button of its header or Space:
 * one field per column, in a vertical form, J and K stepping through the rows.
 */
export interface MatrixRowPanel {
  title?: BlockText;
  /** Adds a read-only JSON tab of the row. */
  showJson?: boolean;
  /** Puts the open row in the page URL, so a link or a refresh opens it again. */
  deepLink?: boolean;
}

/**
 * An action on a row, in the menu of its header (Override, Revert, Delete).
 * `{{row.X}}` takes the row's values, plus `{{row.id}}`.
 */
export interface MatrixRowAction {
  id: string;
  label: BlockText;
  icon?: string;
  tone?: MatrixTone;
  target: ActionTarget;
}

/** A row action as the block receives it, its target serialized. */
export interface MatrixRowActionSerialized extends Omit<
  MatrixRowAction,
  "target"
> {
  target: ActionTargetSerialized;
}

/**
 * Row totals (a Total column, drawn after the last column it adds up and
 * before the columns left out of the totals), column totals (a Total row),
 * or both.
 */
export interface MatrixTotals {
  rows?: boolean;
  columns?: boolean;
  label?: BlockText;
}

/**
 * Rows cut into groups, each under a header row. A row joins the group its
 * `group` names (groups the server builds, described by the response's
 * `groups`), else the group of its value in `groupByField`.
 */
export interface MatrixGrouping {
  /**
   * Column the rows are grouped on, for rows that name no `group`. The route
   * lists the rows sorted on it, so a group's rows follow each other.
   */
  groupByField?: string;
  /**
   * A click on a group header folds its rows. Defaults to `true` when groups
   * may start folded (`collapseAbove`, or a group answered `collapsed`), so a
   * folded group can always be opened; `false` keeps every group open.
   */
  collapsible?: boolean;
  /** Groups start collapsed past this many rows. */
  collapseAbove?: number;
  /** Group headers show how many rows the group holds. */
  count?: boolean;
  /** With `totals.columns`, each group header carries its own column sums. */
  subtotals?: boolean;
}

export interface MatrixProps extends BaseComponentProps {
  title?: BlockText;
  description?: BlockText;

  /** Where the rows are read from, answering {@link MatrixData}. Takes `{{params.X}}` and `{{query.X}}`. */
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  /** Reads `fetchUrl` again on each event of these topics. */
  realtimeTopic?: string | string[];
  /** Rows given in the options, for a grid without a route. */
  staticData?: MatrixData;

  /** Where edits are written, receiving {@link MatrixSaveRequest}. No `saveUrl`, no editing. */
  saveUrl?: string;
  /** Defaults to POST. */
  saveUrlMethod?: EnumOption<HttpMethod>;

  columns?: MatrixColumn[];
  rowHeader?: MatrixRowHeader;

  /** Defaults to `true` when `saveUrl` is set. */
  editable?: boolean;
  /** Defaults to `doubleClick`: a click selects the cell. */
  editTrigger?: MatrixEditTrigger;
  /** Typing on a selected cell starts editing it with that character, as a spreadsheet does. */
  typeToEdit?: boolean;
  /** Defaults to `immediate`. */
  saveMode?: MatrixSaveMode;
  /** `staged`: lists the changes, before → after, before writing them. */
  review?: boolean;
  /** Seconds an Undo stays offered after a save. 0 or absent: no undo. */
  undoSeconds?: number;
  /** Defaults to `overwrite`. */
  conflicts?: MatrixConflictMode;
  /** Defaults to `down`. */
  enterMove?: MatrixEnterMove;
  /** The ⤢ button opening a row in a drawer. `true` for the defaults. */
  rowPanel?: boolean | MatrixRowPanel;
  /**
   * What a click on a read-only cell opens. `{{row.X}}` takes the row's
   * values, plus `{{row.id}}`, `{{row.column}}` (the column id) and
   * `{{row.value}}` (the cell's value).
   */
  cellAction?: ActionTarget;
  rowActions?: MatrixRowAction[];
  /** A checkbox per row; fill actions receive the checked ids as `selected`. */
  selectable?: boolean;
  fillActions?: MatrixFillAction[];

  /** Defaults to `none` (every row at once). */
  pagination?: MatrixPagination;
  pageSize?: number;
  /** The page sizes offered in the footer. */
  pageSizes?: number[];
  search?: boolean;
  statusFilters?: MatrixStatusFilter[];
  facets?: MatrixFacet[];
  /** Header clicks sort, sent as `sort` and `direction`. */
  sortable?: boolean;
  /**
   * A filter per column in its header (contains, is), sent as
   * `filter_<columnId>=<mode>:<value>` like a table view's, and shown as
   * removable chips.
   */
  columnFilters?: boolean;
  /** Keeps page, search, status and facets in the page URL. Defaults to `true`. */
  urlState?: boolean;

  grouping?: MatrixGrouping;
  totals?: MatrixTotals;
  targets?: MatrixTargets;
  /** Lights the hovered cell's row and column. */
  crossHighlight?: boolean;
  /** Show, hide and reorder columns, remembered on the device. */
  columnsMenu?: boolean;
  resizableColumns?: boolean;
  /**
   * N and Shift+N jump to the next and previous empty editable cell. With
   * `typeToEdit`, a letter starts editing instead, and the jump is Alt+N and
   * Alt+Shift+N.
   */
  jumpToEmpty?: boolean;
  /** Keeps a row the user edited on screen after it stops matching the filters. */
  keepEditedRows?: boolean;
  /** A CSV export of the rows shown. */
  exportCsv?: boolean;
  legend?: MatrixLegendItem[];
  emptyLabel?: BlockText;
  maxHeight?: string;
  density?: "compact" | "comfortable";
}

/** The options as the block receives them, its targets serialized. */
export interface MatrixPropsSerialized extends Omit<
  MatrixProps,
  "cellAction" | "rowActions"
> {
  cellAction?: ActionTargetSerialized;
  rowActions?: MatrixRowActionSerialized[];
}
