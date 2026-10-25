// Mirror of the Matrix block contract of @antelopejs/interface-dms/base/matrix.
// The frontend layer never imports the interface package: keep both in step.

import type { BlockText } from "#dms-core/app/types/composed-text";
import type { ActionTarget } from "../composables/table-view/types/action-target";
import type { ColumnDisplay } from "../build/composables/data-types/useColumnValueRenderer";
import type { Tone } from "./tone";

/** What a cell holds, which picks the input that edits it and how it is drawn. */
export type MatrixCellKind =
  | "text"
  | "longText"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "select"
  | "tags"
  | "json"
  | "code"
  | "richText"
  | "keyValue"
  | "address";

/** The kinds edited in a drawer by default (`editIn: "auto"`), never in the cell. */
export const MATRIX_PANEL_KINDS: readonly MatrixCellKind[] = [
  "json",
  "code",
  "richText",
  "keyValue",
  "address",
];

/** Past this length, an `auto` text cell is edited in the drawer. */
export const MATRIX_LONG_TEXT_LENGTH = 120;

export type MatrixEditIn = "cell" | "panel" | "auto";
export type MatrixEditTrigger = "click" | "doubleClick";
export type MatrixSaveMode = "immediate" | "staged";
export type MatrixEnterMove = "down" | "right" | "stay";
export type MatrixConflictMode = "overwrite" | "detect";
export type MatrixPagination = "none" | "pages" | "infinite";
export type MatrixDensity = "compact" | "comfortable";
export type MatrixAlign = "start" | "center" | "end";

/** The tones a cell, a row or a select option may take. */
export type MatrixTone = Extract<
  Tone,
  "neutral" | "primary" | "success" | "warning" | "error" | "info"
>;

export interface MatrixSelectOption {
  value: string;
  label: BlockText;
  tone?: MatrixTone;
  icon?: string;
}

export interface MatrixColumn {
  id: string;
  label: BlockText;
  kind?: MatrixCellKind;
  icon?: string;
  description?: BlockText;
  width?: number;
  editable?: boolean;
  editIn?: MatrixEditIn;
  options?: MatrixSelectOption[];
  language?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  nullable?: boolean;
  required?: boolean;
  excludeFromTotals?: boolean;
  align?: MatrixAlign;
  display?: ColumnDisplay;
  component?: string;
  badge?: BlockText;
  badgeTone?: MatrixTone;
  progress?: number;
  progressTone?: MatrixTone;
  hidden?: boolean;
  pinned?: boolean;
}

export interface MatrixCellState {
  tone?: MatrixTone;
  hint?: BlockText;
  disabled?: boolean;
  readOnly?: boolean;
  issues?: BlockText[];
  /** Greyed while the cell is empty, and shown above its editor. */
  placeholder?: BlockText;
  /** Overrides the column's `editIn` for this cell. */
  editIn?: MatrixEditIn;
  previous?: unknown;
}

export interface MatrixRow {
  id: string;
  label?: BlockText;
  description?: BlockText;
  group?: string;
  values: Record<string, unknown>;
  cells?: Record<string, MatrixCellState>;
  readOnly?: boolean;
  tone?: MatrixTone;
  /** A pill after the row label ("Overridden"). */
  badge?: BlockText;
  badgeTone?: MatrixTone;
}

export interface MatrixGroup {
  id: string;
  label: BlockText;
  description?: BlockText;
  badge?: BlockText;
  badgeTone?: MatrixTone;
  collapsed?: boolean;
}

export interface MatrixTargets {
  rows?: Record<string, number>;
  columns?: Record<string, number>;
  total?: number;
  blockSave?: boolean;
  message?: BlockText;
}

export interface MatrixFacetItem {
  value: string;
  label: BlockText;
  count?: number;
}

export interface MatrixData {
  rows: MatrixRow[];
  columns?: MatrixColumn[];
  total?: number;
  groups?: MatrixGroup[];
  counts?: Record<string, number>;
  facets?: Record<string, MatrixFacetItem[]>;
  targets?: MatrixTargets;
  footer?: BlockText;
}

export interface MatrixChange {
  rowId: string;
  columnId: string;
  value: unknown;
  previous: unknown;
}

export interface MatrixSaveRequest {
  changes: MatrixChange[];
  force?: boolean;
  /** The block's `conflicts` mode, so a generic route knows whether to check `previous`. */
  conflicts?: MatrixConflictMode;
  /** The list query (search, status, facets), without paging: for filtered `counts`. */
  query?: Record<string, string>;
}

export interface MatrixCellError {
  rowId: string;
  columnId?: string;
  message: BlockText;
}

export interface MatrixConflict {
  rowId: string;
  columnId: string;
  current: unknown;
}

/**
 * The answer of `saveUrl`. A change it names in neither `errors` nor
 * `conflicts` counts as written, its cell keeping the value sent; `columns`,
 * `groups` and `footer` replace theirs.
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

export interface MatrixFillAction {
  id: string;
  label: BlockText;
  icon?: string;
  url: string;
  method?: string;
}

/** What a fill action's route answers: the cells to set, as edits. */
/** A cell a fill sets (an answered `previous` is ignored). */
export type MatrixFillChange = Pick<
  MatrixChange,
  "rowId" | "columnId" | "value"
>;

export interface MatrixFillResponse {
  changes?: MatrixFillChange[];
}

export interface MatrixStatusFilter {
  id: string;
  label: BlockText;
  tone?: MatrixTone;
}

export interface MatrixFacet {
  id: string;
  label: BlockText;
  icon?: string;
  multiple?: boolean;
  items?: MatrixFacetItem[];
}

export interface MatrixLegendItem {
  label: BlockText;
  tone?: MatrixTone;
  hatched?: boolean;
}

export interface MatrixRowHeader {
  label?: BlockText;
  width?: number;
  numbers?: boolean;
}

export interface MatrixRowPanel {
  title?: BlockText;
  showJson?: boolean;
  /** The open row in the page URL, opened again on load. */
  deepLink?: boolean;
}

/** An action in the menu of a row's header; `{{row.X}}` and `{{row.id}}` fill. */
export interface MatrixRowAction {
  id: string;
  label: BlockText;
  icon?: string;
  tone?: MatrixTone;
  target: ActionTarget;
  /** Offered only on the rows whose value in `field` is one of `in`. */
  visibleWhen?: MatrixFieldCondition;
}

/** A row's value in `field` is one of `in`. */
export interface MatrixFieldCondition {
  field: string;
  in: readonly unknown[];
}

export interface MatrixTotals {
  rows?: boolean;
  columns?: boolean;
  label?: BlockText;
}

/**
 * Rows cut into groups under header rows: a row joins the group its `group`
 * names (described by the response's `groups`), else the group of its raw
 * value in `groupByField`.
 */
export interface MatrixGrouping {
  groupByField?: string;
  /** A click on a group header folds its rows, kept while the page stays open. */
  collapsible?: boolean;
  collapseAbove?: number;
  /** Group headers show how many rows the group holds. */
  count?: boolean;
  /** With `totals.columns`, each group header carries its own column sums. */
  subtotals?: boolean;
}

/** The options of a `Matrix` block, as the block receives them. */
export interface MatrixOptions {
  title?: BlockText;
  description?: BlockText;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  realtimeTopic?: string | string[];
  staticData?: MatrixData;
  saveUrl?: string;
  saveUrlMethod?: string;
  columns?: MatrixColumn[];
  rowHeader?: MatrixRowHeader;
  editable?: boolean;
  editTrigger?: MatrixEditTrigger;
  typeToEdit?: boolean;
  saveMode?: MatrixSaveMode;
  review?: boolean;
  undoSeconds?: number;
  conflicts?: MatrixConflictMode;
  enterMove?: MatrixEnterMove;
  rowPanel?: boolean | MatrixRowPanel;
  cellAction?: ActionTarget;
  rowActions?: MatrixRowAction[];
  /** A checkbox per row; fills receive the checked ids as `selected`. */
  selectable?: boolean;
  fillActions?: MatrixFillAction[];
  pagination?: MatrixPagination;
  pageSize?: number;
  pageSizes?: number[];
  search?: boolean;
  statusFilters?: MatrixStatusFilter[];
  facets?: MatrixFacet[];
  sortable?: boolean;
  /** A contains / is filter in each header, sent as `filter_<columnId>=<mode>:<value>`. */
  columnFilters?: boolean | string[];
  urlState?: boolean;
  grouping?: MatrixGrouping;
  totals?: MatrixTotals;
  targets?: MatrixTargets;
  crossHighlight?: boolean;
  columnsMenu?: boolean;
  resizableColumns?: boolean;
  jumpToEmpty?: boolean;
  keepEditedRows?: boolean;
  exportCsv?: boolean;
  legend?: MatrixLegendItem[];
  emptyLabel?: BlockText;
  maxHeight?: string;
  density?: MatrixDensity;
}
