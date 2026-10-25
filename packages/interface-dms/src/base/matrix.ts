import { ComponentBuilder } from "../component";
import { z } from "zod";
import {
  type BlockOptionsFor,
  opaqueOption,
  RegisterBlockType,
  ui,
} from "./block-registry";
import { blockRealtimeTopicOption } from "./display";
import { attachRealtimeTopicsHook } from "./internal/realtime-topics";
import type { ColumnDisplaySerialized } from "./table-view/column-display";
import type {
  ActionTarget,
  ActionTargetSerialized,
} from "./types/action-target";
import { serializeActionTarget } from "./types/internal/action-target";
import type { BlockText } from "./types/composed-text";
import { HttpMethod } from "./types/http";
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
  /** Left out of the row totals (an annex column, a price). Numbers count by default. */
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
  /** Greyed text shown while the cell is empty (the inherited or base text). */
  placeholder?: BlockText;
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
 * named in `errors` or `conflicts` stays in its cell with the message. A
 * non-2xx answer fails every change of the request.
 */
export interface MatrixSaveResponse {
  rows?: MatrixRow[];
  errors?: MatrixCellError[];
  conflicts?: MatrixConflict[];
  counts?: Record<string, number>;
  targets?: MatrixTargets;
}

/**
 * A server-computed fill (all to the warehouse, by minimum stock, clear): the
 * grid posts its rows as shown (`{ rows }`) and applies the answered
 * `{ changes }` as edits, through the save mode like typed ones.
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
}

/** Row totals (a Total column), column totals (a Total row), or both. */
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
export interface MatrixPropsSerialized extends Omit<MatrixProps, "cellAction"> {
  cellAction?: ActionTargetSerialized;
}

const MATRIX_COMPONENT_NAME = "dms-matrix-block";
const DEFAULT_ICON = "i-ph-grid-nine";

/**
 * A grid of rows by columns whose cells are read and edited in place: the
 * records of a collection, the languages of a translation key, the sizes of
 * an article by store. `options` is optional so a page under construction may
 * write the bare call `Matrix()`.
 */
export function Matrix(
  options?: MatrixProps,
): ComponentBuilder<MatrixPropsSerialized> {
  const { cellAction, ...rest } = options ?? {};
  const serialized: MatrixPropsSerialized = {
    ...rest,
    ...(cellAction && { cellAction: serializeActionTarget(cellAction) }),
  };
  return attachRealtimeTopicsHook(
    new ComponentBuilder<MatrixPropsSerialized>(MATRIX_COMPONENT_NAME)
      .options(serialized)
      .meta({ name: "Matrix", icon: DEFAULT_ICON }),
    options?.realtimeTopic,
  );
}

/** The options `Matrix` accepts. */
export const MatrixSchema = z.object({
  title: ui(opaqueOption<BlockText>().optional(), {
    label: "Title",
    group: "content",
  }),
  description: ui(opaqueOption<BlockText>().optional(), {
    label: "Description",
    group: "content",
  }),
  fetchUrl: ui(
    z.string().optional().describe("Where the rows are read from."),
    {
      label: "Data source",
      group: "data",
      widget: "dataSource",
    },
  ),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "advanced",
    widget: "select",
  }),
  realtimeTopic: blockRealtimeTopicOption(),
  staticData: ui(opaqueOption<MatrixData>().optional(), {
    label: "Static data",
    group: "advanced",
    widget: "json",
  }),
  saveUrl: ui(z.string().optional().describe("Where edits are written."), {
    label: "Save route",
    group: "data",
    widget: "url",
  }),
  saveUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "Save method",
    group: "advanced",
    widget: "select",
  }),
  columns: ui(opaqueOption<MatrixColumn[]>().optional(), {
    label: "Columns",
    group: "data",
    widget: "json",
  }),
  rowHeader: ui(opaqueOption<MatrixRowHeader>().optional(), {
    label: "Row header",
    group: "appearance",
    widget: "json",
  }),
  editable: ui(z.boolean().optional(), {
    label: "Editable",
    group: "behavior",
    widget: "switch",
  }),
  editTrigger: ui(z.enum(["click", "doubleClick"]).optional(), {
    label: "Edit on",
    group: "behavior",
    widget: "segmented",
  }),
  typeToEdit: ui(z.boolean().optional(), {
    label: "Type to edit",
    group: "behavior",
    widget: "switch",
  }),
  saveMode: ui(z.enum(["immediate", "staged"]).optional(), {
    label: "Save mode",
    group: "behavior",
    widget: "segmented",
  }),
  review: ui(z.boolean().optional(), {
    label: "Review before saving",
    group: "behavior",
    widget: "switch",
  }),
  undoSeconds: ui(z.number().int().min(0).optional(), {
    label: "Undo window (s)",
    group: "behavior",
    widget: "number",
    min: 0,
  }),
  conflicts: ui(z.enum(["overwrite", "detect"]).optional(), {
    label: "Conflicts",
    group: "behavior",
    widget: "segmented",
  }),
  enterMove: ui(z.enum(["down", "right", "stay"]).optional(), {
    label: "Enter moves",
    group: "behavior",
    widget: "segmented",
  }),
  rowPanel: ui(opaqueOption<boolean | MatrixRowPanel>().optional(), {
    label: "Row drawer",
    group: "features",
    widget: "json",
  }),
  cellAction: ui(opaqueOption<ActionTargetSerialized>().optional(), {
    label: "Cell action",
    group: "behavior",
    widget: "json",
  }),
  fillActions: ui(opaqueOption<MatrixFillAction[]>().optional(), {
    label: "Fill actions",
    group: "features",
    widget: "json",
  }),
  pagination: ui(z.enum(["none", "pages", "infinite"]).optional(), {
    label: "Pagination",
    group: "data",
    widget: "segmented",
  }),
  pageSize: ui(z.number().int().min(1).optional(), {
    label: "Page size",
    group: "data",
    widget: "number",
    min: 1,
  }),
  pageSizes: ui(z.array(z.number().int().min(1)).optional(), {
    label: "Page sizes",
    group: "data",
    widget: "json",
  }),
  search: ui(z.boolean().optional(), {
    label: "Search",
    group: "features",
    widget: "switch",
  }),
  statusFilters: ui(opaqueOption<MatrixStatusFilter[]>().optional(), {
    label: "Status filters",
    group: "features",
    widget: "json",
  }),
  facets: ui(opaqueOption<MatrixFacet[]>().optional(), {
    label: "Facets",
    group: "features",
    widget: "json",
  }),
  sortable: ui(z.boolean().optional(), {
    label: "Sortable",
    group: "features",
    widget: "switch",
  }),
  urlState: ui(z.boolean().optional(), {
    label: "Keep state in the URL",
    group: "behavior",
    widget: "switch",
  }),
  grouping: ui(opaqueOption<MatrixGrouping>().optional(), {
    label: "Grouping",
    group: "features",
    widget: "json",
  }),
  totals: ui(opaqueOption<MatrixTotals>().optional(), {
    label: "Totals",
    group: "features",
    widget: "json",
  }),
  targets: ui(opaqueOption<MatrixTargets>().optional(), {
    label: "Targets",
    group: "features",
    widget: "json",
  }),
  crossHighlight: ui(z.boolean().optional(), {
    label: "Cross highlight",
    group: "appearance",
    widget: "switch",
  }),
  columnsMenu: ui(z.boolean().optional(), {
    label: "Columns menu",
    group: "features",
    widget: "switch",
  }),
  resizableColumns: ui(z.boolean().optional(), {
    label: "Resizable columns",
    group: "features",
    widget: "switch",
  }),
  jumpToEmpty: ui(z.boolean().optional(), {
    label: "Jump to empty cells",
    group: "behavior",
    widget: "switch",
  }),
  keepEditedRows: ui(z.boolean().optional(), {
    label: "Keep edited rows",
    group: "behavior",
    widget: "switch",
  }),
  exportCsv: ui(z.boolean().optional(), {
    label: "CSV export",
    group: "features",
    widget: "switch",
  }),
  legend: ui(opaqueOption<MatrixLegendItem[]>().optional(), {
    label: "Legend",
    group: "appearance",
    widget: "json",
  }),
  emptyLabel: ui(opaqueOption<BlockText>().optional(), {
    label: "Empty message",
    group: "content",
  }),
  maxHeight: ui(z.string().optional(), {
    label: "Maximum height",
    group: "appearance",
  }),
  density: ui(z.enum(["compact", "comfortable"]).optional(), {
    label: "Density",
    group: "appearance",
    widget: "segmented",
  }),
}) satisfies BlockOptionsFor<MatrixPropsSerialized>;

RegisterBlockType({
  type: "Matrix",
  componentName: MATRIX_COMPONENT_NAME,
  schema: MatrixSchema,
  meta: {
    name: "Matrix",
    icon: DEFAULT_ICON,
    description:
      "A grid of rows by columns edited in place: records, translations, quantities by size and store.",
    group: "data",
  },
});
