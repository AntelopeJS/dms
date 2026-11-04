import { z } from "zod";
import {
  type BlockOptionsFor,
  narrowString,
  opaqueOption,
  RegisterBlockType,
  ui,
} from "../block-registry";
import type { ColorValue } from "../types";
import { toneEnum } from "../internal/display";
import { TONES } from "../types/tone";
import type { CustomButton } from "../types/custom-button";
import type { TableViewGuards } from "../types/guards";
import type { RowActionRule } from "../types/row-action";
import type { ModalSize } from "../types/size";
import {
  DEFAULT_ROW_ID_FIELD,
  type FormContainer,
  MAX_TABLE_PAGE_SIZE,
  type KanbanOptions,
  type QueryParamFilter,
  type RouteParamFilter,
  type TableViewCardOptions,
  type TableViewDisplayOption,
  type TableViewExpandableComponent,
  type TableViewExpandableOptions,
  type TableViewQuickFilter,
  type TableViewOptions,
  type TableViewTab,
} from "./options";
import { TABLE_VIEW_COMPONENT_NAME } from "./internal/options";
import { rowActionsSchema } from "./internal/row-actions-schema";

const DEFAULT_KANBAN_COLUMN_MAX_HEIGHT = "60vh";

const tabFilterSchema = z.object({
  accessorKey: ui(z.string(), {
    label: "Field",
    widget: "field",
    fieldAspect: "filterable",
  }),
  value: z.string().optional(),
  mode: z.string(),
});

const tabSchema = z.object({
  id: z.string(),
  label: z.string(),
  filter: ui(
    tabFilterSchema
      .optional()
      .describe("Filter on one column. A tab with a link filters nothing."),
    { label: "Filter" },
  ),
  icon: ui(z.string().optional(), { widget: "icon" }),
  textColor: ui(narrowString<ColorValue>().optional(), { widget: "color" }),
  iconColor: ui(narrowString<ColorValue>().optional(), { widget: "color" }),
  to: ui(opaqueOption<TableViewTab["to"]>().optional(), {
    label: "Link to",
    widget: "url",
  }),
  permission: ui(
    z.string().optional().describe("An action of this table, by name."),
    { label: "Action", advanced: true },
  ),
  permissionId: ui(z.string().optional(), {
    label: "Permission",
    widget: "permission",
  }),
  countFrom: ui(opaqueOption<TableViewTab["countFrom"]>().optional(), {
    label: "Count from",
    hidden: true,
  }),
  navBadge: ui(
    z
      .union([z.boolean(), z.object({ tone: toneEnum(TONES).optional() })])
      .optional()
      .describe("`true`, or `{ tone }` to draw the badge in a tone."),
    { label: "Navigation badge", widget: "switch" },
  ),
}) satisfies BlockOptionsFor<TableViewTab>;

const quickFilterSchema = z.object({
  field: ui(z.string(), {
    label: "Field",
    widget: "field",
    fieldAspect: "filterable",
  }),
  label: z.string().optional(),
  icon: ui(z.string().optional(), { widget: "icon" }),
  allLabel: z.string().optional(),
  mode: z
    .enum(["is", "is_not", "include", "exclude", "array_contains_string"])
    .optional(),
}) satisfies BlockOptionsFor<TableViewQuickFilter>;

const formContainerPageConfigSchema = z.object({
  urlSlug: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  customPage: z.boolean().optional(),
});

const formContainerPageTextsSchema = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
});

const formContainerPagesSchema = <Page extends z.ZodTypeAny>(page: Page) =>
  z
    .object({
      new: page.optional(),
      edit: page.optional(),
      details: page.optional(),
    })
    .optional()
    .describe("Titles of the add, edit and details forms.");

const formContainerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("drawer"),
    pages: formContainerPagesSchema(formContainerPageTextsSchema),
  }),
  z.object({
    type: z.literal("modal"),
    size: narrowString<ModalSize>().optional(),
    pages: formContainerPagesSchema(formContainerPageTextsSchema),
  }),
  z.object({
    type: z.literal("page"),
    pages: formContainerPagesSchema(formContainerPageConfigSchema),
  }),
]) satisfies BlockOptionsFor<FormContainer>;

const paramFilterSchema = z.object({
  field: ui(z.string(), { widget: "field", fieldAspect: "filterable" }),
  mode: z.string().optional(),
}) satisfies BlockOptionsFor<RouteParamFilter>;

const queryParamFilterSchema = paramFilterSchema.extend({
  visible: z.boolean().optional(),
  label: z.string().optional(),
}) satisfies BlockOptionsFor<QueryParamFilter>;

const kanbanSchema = z.object({
  groupByField: ui(
    z.string().describe("Field the cards are grouped into columns by."),
    { label: "Group by", widget: "field", fieldAspect: "filterable" },
  ),
  draggable: ui(z.boolean().default(true), {
    label: "Drag between columns",
    widget: "switch",
  }),
  columnMaxHeight: z.string().default(DEFAULT_KANBAN_COLUMN_MAX_HEIGHT),
}) satisfies BlockOptionsFor<KanbanOptions>;

const cardSchema = z.object({
  fields: ui(z.array(z.string()).optional(), {
    label: "Card fields",
    widget: "field",
    fieldAspect: "listable",
  }),
  component: ui(opaqueOption<TableViewCardOptions["component"]>().optional(), {
    label: "Card component",
    hidden: true,
  }),
}) satisfies BlockOptionsFor<TableViewCardOptions>;

const displaySchema = z.object({
  id: z.string(),
  options: z.record(z.unknown()).optional(),
  component: ui(
    opaqueOption<TableViewDisplayOption["component"]>().optional(),
    { hidden: true },
  ),
  selfManagedData: z.boolean().optional(),
  capabilities: z
    .object({
      columnManagement: z.boolean().optional(),
      filters: z.boolean().optional(),
      search: z.boolean().optional(),
      sorting: z.boolean().optional(),
      tabs: z.boolean().optional(),
      header: z.boolean().optional(),
    })
    .optional(),
}) satisfies BlockOptionsFor<TableViewDisplayOption>;

const expandableFieldSchema = z.union([
  ui(z.string(), {
    widget: "field",
    fieldAspect: "listable",
  }),
  z.object({
    key: ui(z.string(), { widget: "field", fieldAspect: "listable" }),
    label: z.string().optional(),
  }),
]);

const expandableBehaviorOptions = {
  defaultExpanded: ui(z.enum(["none", "first", "all"]).default("none"), {
    label: "Open on arrival",
    widget: "segmented",
  }),
  single: ui(z.boolean().optional(), {
    label: "One row at a time",
    widget: "switch",
  }),
  lazyLoad: ui(z.boolean().optional(), {
    label: "Load the row on open",
    widget: "switch",
  }),
};

const expandableSchema = z.union([
  z.object({
    fields: ui(z.array(expandableFieldSchema), { label: "Detail fields" }),
    fieldsLabel: ui(z.string().optional(), { label: "Fields heading" }),
    ...expandableBehaviorOptions,
  }),
  z.object({
    component: ui(opaqueOption<TableViewExpandableComponent["component"]>(), {
      label: "Detail component",
      hidden: true,
    }),
    ...expandableBehaviorOptions,
  }),
]) satisfies BlockOptionsFor<TableViewExpandableOptions>;

/** An option naming one of the displays offered. */
const displayIdOption = (label: string) =>
  ui(z.string().optional(), { label, group: "advanced" });

/** The options `TableView` accepts, after its controller argument. */
export const TableViewSchema = z.object({
  caption: ui(z.string().optional().describe("Heading above the table."), {
    label: "Table title",
    order: 1,
    group: "content",
  }),
  density: ui(z.enum(["default", "compact"]).optional(), {
    label: "Density",
    group: "appearance",
    widget: "segmented",
  }),
  maxHeight: ui(
    z
      .string()
      .optional()
      .describe(
        "Height of the rows' own scroll area, under a sticky header, e.g. 60vh.",
      ),
    { label: "Max height", group: "appearance", advanced: true },
  ),
  rowClick: ui(
    z
      .enum(["single", "double", "none"])
      .optional()
      .describe("Whether a row opens with one click, two, or not at all."),
    { label: "Row click", group: "features", widget: "segmented" },
  ),
  inlineEdit: ui(
    z
      .union([
        z.boolean(),
        z.object({
          columns: ui(z.array(z.string()).optional(), {
            label: "Columns",
            widget: "field",
            /** Only a listed column has a cell to edit. */
            fieldAspect: "listable",
          }),
          inputs: ui(z.enum(["hover", "always"]).optional(), {
            label: "Inputs",
            widget: "segmented",
          }),
        }),
      ])
      .optional()
      .describe(
        "Edit a row's simple values in the grid, each saved at once; `{ columns }` names the ones edited.",
      ),
    { label: "Edit in the grid", group: "features", widget: "switch" },
  ),
  expandable: ui(
    expandableSchema
      .optional()
      .describe("A caret column opens a detail band under each row."),
    { label: "Expandable rows", group: "features", advanced: true },
  ),
  layout: ui(
    z
      .enum(["full", "compact"])
      .optional()
      .describe(
        "Full for a page of its own, compact for a short list in a settings page.",
      ),
    { label: "Layout", group: "appearance", widget: "segmented" },
  ),
  searchPlaceholder: ui(z.string().optional(), {
    label: "Search placeholder",
    group: "content",
  }),
  searchShortcut: ui(
    z
      .string()
      .optional()
      .describe(
        'Key opening the search, as defineShortcuts names it ("/", "shift_f").',
      ),
    { label: "Search shortcut", group: "features", advanced: true },
  ),
  quickFilters: ui(z.array(quickFilterSchema).optional(), {
    label: "Quick filters",
    group: "features",
  }),
  pageSize: ui(z.number().int().min(1).max(MAX_TABLE_PAGE_SIZE).optional(), {
    label: "Rows per page",
    group: "appearance",
    widget: "number",
    min: 1,
    max: MAX_TABLE_PAGE_SIZE,
  }),
  footer: ui(
    z
      .object({
        countLabel: z.string().optional(),
        hint: z.string().optional(),
      })
      .optional(),
    { label: "Footer texts", group: "content" },
  ),
  rowIdKey: ui(z.string().default(DEFAULT_ROW_ID_FIELD), {
    label: "Row id field",
    group: "advanced",
    widget: "field",
    fieldAspect: "listable",
  }),
  labelKey: ui(
    z
      .string()
      .optional()
      .describe("The column that names a row in the titles of its windows."),
    {
      label: "Label field",
      order: 2,
      group: "content",
      widget: "field",
      fieldAspect: "listable",
    },
  ),
  rowActions: ui(rowActionsSchema.optional(), {
    label: "Features",
    group: "features",
    flatten: true,
  }),
  customButtons: ui(opaqueOption<CustomButton[]>().optional(), {
    label: "Toolbar buttons",
    hidden: true,
  }),
  formContainer: ui(formContainerSchema.optional(), {
    label: "Form container",
    group: "advanced",
  }),
  archiveMode: ui(
    z
      .boolean()
      .optional()
      .describe(
        "The row is archived instead of erased, and stays readable in archive mode.",
      ),
    { label: "Ghost delete", order: 4, group: "features", widget: "switch" },
  ),
  archivedCountLabel: ui(
    z
      .string()
      .optional()
      .describe(
        'Count shown while the archive is listed, with {count} ("13 archived invoices").',
      ),
    { label: "Archived count", group: "content" },
  ),
  defaultFilters: ui(z.array(tabFilterSchema).optional(), {
    label: "Default filters",
    group: "advanced",
    widget: "json",
  }),
  defaultSort: ui(
    z
      .object({
        field: ui(z.string(), { widget: "field", fieldAspect: "sortable" }),
        desc: z.boolean().optional(),
      })
      .optional(),
    { label: "Default sort", group: "data" },
  ),
  pinnedRows: ui(
    opaqueOption<RowActionRule>()
      .optional()
      .describe("Rows listed first whatever the sort: a rule on their fields."),
    { label: "Pinned rows", group: "data", widget: "json", advanced: true },
  ),
  queryParamFilters: ui(z.record(queryParamFilterSchema).optional(), {
    label: "Query parameter filters",
    group: "advanced",
    widget: "json",
  }),
  routeParamFilters: ui(z.record(paramFilterSchema).optional(), {
    label: "Route parameter filters",
    group: "advanced",
    widget: "json",
  }),
  strictRuleValidation: ui(z.boolean().optional(), {
    label: "Strict rule validation",
    group: "advanced",
    widget: "switch",
  }),
  tabs: ui(z.array(tabSchema).optional(), {
    label: "Tabs",
    group: "advanced",
  }),
  realtime: ui(z.boolean().default(true), {
    label: "Realtime updates",
    group: "advanced",
    widget: "switch",
  }),
  realtimeTopic: ui(
    z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Topics whose events make the table read its rows again."),
    { label: "Realtime topics", group: "data", advanced: true },
  ),
  liveHold: ui(
    z
      .union([
        z.boolean(),
        z.object({
          whileRowOpen: z.boolean().optional(),
          whileScrolled: z.boolean().optional(),
          whileSearching: z.boolean().optional(),
          whileSorted: z.boolean().optional(),
          missedLabel: z.string().optional(),
        }),
      ])
      .optional()
      .describe(
        "On a live page, keeps the rows while paused or on screen and shows what is new over them; `{ whileRowOpen, whileScrolled, whileSearching, whileSorted }` also names why it holds in Direct, `missedLabel` words the new rows.",
      ),
    {
      label: "Hold rows while paused",
      group: "data",
      widget: "switch",
      advanced: true,
    },
  ),
  kanban: ui(kanbanSchema.optional(), { label: "Kanban", group: "advanced" }),
  card: ui(cardSchema.optional(), {
    label: "Cards",
    group: "advanced",
  }),
  displays: ui(z.array(displaySchema).optional(), {
    label: "Displays",
    group: "advanced",
  }),
  defaultDisplay: displayIdOption("Default display"),
  mobileDisplay: displayIdOption("Display on phones"),
  guards: ui(opaqueOption<TableViewGuards>().optional(), {
    label: "Guards",
    hidden: true,
  }),
  bypassTenantAccessGate: ui(z.boolean().optional(), {
    label: "Bypass tenant access gate",
    group: "advanced",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<TableViewOptions>;

RegisterBlockType({
  type: "TableView",
  componentName: TABLE_VIEW_COMPONENT_NAME,
  schema: TableViewSchema,
  controllerArg: true,
  meta: {
    name: "Table",
    icon: "i-ph-table",
    description: "Paginated table over a resource, with its forms and actions.",
    group: "data",
  },
});
