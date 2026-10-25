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
import type {
  MatrixColumn,
  MatrixData,
  MatrixFacet,
  MatrixFillAction,
  MatrixGrouping,
  MatrixLegendItem,
  MatrixProps,
  MatrixPropsSerialized,
  MatrixRowActionSerialized,
  MatrixRowHeader,
  MatrixRowPanel,
  MatrixStatusFilter,
  MatrixTargets,
  MatrixTotals,
} from "./matrix-types";
import type { ActionTargetSerialized } from "./types/action-target";
import { serializeActionTarget } from "./types/internal/action-target";
import type { BlockText } from "./types/composed-text";
import { HttpMethod } from "./types/http";

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
  const { cellAction, rowActions, ...rest } = options ?? {};
  const serialized: MatrixPropsSerialized = {
    ...rest,
    ...(cellAction && { cellAction: serializeActionTarget(cellAction) }),
    ...(rowActions && {
      rowActions: rowActions.map((action) => ({
        ...action,
        target: serializeActionTarget(action.target),
      })),
    }),
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
  rowActions: ui(opaqueOption<MatrixRowActionSerialized[]>().optional(), {
    label: "Row actions",
    group: "features",
    widget: "json",
  }),
  selectable: ui(z.boolean().optional(), {
    label: "Row checkboxes",
    group: "features",
    widget: "switch",
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
  columnFilters: ui(z.boolean().optional(), {
    label: "Column filters",
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
