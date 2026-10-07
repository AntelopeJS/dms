import { z } from "zod";
import {
  type BlockOptionsFor,
  narrowString,
  opaqueOption,
  RegisterBlockType,
  ui,
} from "../block-registry";
import type { ColorValue } from "../types";
import type { CustomButton } from "../types/custom-button";
import type { TableViewGuards } from "../types/guards";
import type { CustomRowAction, RowActionRule } from "../types/row-action";
import type { ModalSize } from "../types/size";
import {
  DEFAULT_ROW_ID_FIELD,
  type FormContainer,
  MAX_TABLE_PAGE_SIZE,
  type KanbanOptions,
  type QueryParamFilter,
  type RouteParamFilter,
  type TableViewCardOptions,
  TABLE_DISPLAY_ID,
  type TableViewDisplayOption,
  type TableViewExpandableComponent,
  type TableViewExpandableOptions,
  type TableViewQuickFilter,
  type TableViewOptions,
  type TableViewRowActionOptions,
  type TableViewTab,
} from "./options";
import { TABLE_VIEW_COMPONENT_NAME } from "./internal/options";

const DEFAULT_KANBAN_COLUMN_MAX_HEIGHT = "60vh";

const rowActionConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  rule: ui(opaqueOption<RowActionRule>().optional(), {
    label: "Rule",
    widget: "json",
  }),
});

interface RowActionDefaults {
  /**
   * Whether the table offers the action when nothing turns it off, to whoever
   * holds its permission. The factory reads an absent action as on, and says so
   * here so an editor's switch does not show a feature the table has as off.
   */
  offered?: boolean;
  /** When the action is offered at all, for one that depends on another. */
  note?: string;
}

const rowActionOption = (
  label: string,
  order: number,
  { offered = true, note }: RowActionDefaults = {},
) => {
  const action = z.union([z.boolean(), rowActionConfigSchema]);
  const described = note ? action.describe(note) : action;
  return ui(offered ? described.default(true) : described.optional(), {
    label,
    order,
    group: "features",
    widget: "switch",
  });
};

const rowActionsSchema = z.object({
  add: rowActionOption("Adding data", 1),
  edit: rowActionOption("Editing data", 2),
  delete: rowActionOption("Deleting data", 3),
  // Turned off whenever editing is on without a rule: editing opens the row
  // already, so the factory drops the second way in.
  details: rowActionOption("View details", 6, {
    offered: false,
    note: "Offered while editing is off: editing already opens the row.",
  }),
  duplicate: rowActionOption("Duplicate", 7),
  archive: rowActionOption("Archive", 8, {
    note: "Offered while ghost delete is on.",
  }),
  restore: rowActionOption("Restore", 9, {
    note: "Offered while ghost delete is on.",
  }),
  copyLink: rowActionOption("Copy link", 10),
  hasSelection: ui(z.boolean().optional(), {
    label: "Row selection",
    order: 11,
    group: "features",
    widget: "switch",
  }),
  custom: ui(opaqueOption<CustomRowAction[]>().optional(), {
    label: "Custom actions",
    hidden: true,
  }),
}) satisfies BlockOptionsFor<TableViewRowActionOptions>;

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
  // A page controller target is a live class: editors set a path.
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
  navBadge: ui(z.boolean().optional(), {
    label: "Navigation badge",
    widget: "switch",
  }),
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
}) satisfies BlockOptionsFor<QueryParamFilter & RouteParamFilter>;

const kanbanSchema = z.object({
  groupByField: ui(
    z.string().describe("Field the cards are grouped into columns by."),
    // Each column is fetched with `filter_<field>`, so the field has to be
    // filterable. It does not have to be listed: the columns themselves are
    // built from the field's declared type — a select's items, a boolean's two
    // labels — never from the rows. The one row read is a badge count during a
    // drag, which goes stale rather than wrong when the field is not listed.
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
    // Resolved against the table's listable columns; an unlisted field renders
    // as nothing at all rather than reporting anything.
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
    // Read straight off the listed row: an unlisted field shows an empty value.
    fieldAspect: "listable",
  }),
  z.object({
    key: ui(z.string(), { widget: "field", fieldAspect: "listable" }),
    label: z.string().optional(),
  }),
]);

const expandableBehaviorShape = {
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

// The band lists fields or renders a component, never both: one shape each.
const expandableSchema = z.union([
  z.object({
    fields: ui(z.array(expandableFieldSchema), { label: "Detail fields" }),
    fieldsLabel: ui(z.string().optional(), { label: "Fields heading" }),
    ...expandableBehaviorShape,
  }),
  z.object({
    component: ui(opaqueOption<TableViewExpandableComponent["component"]>(), {
      label: "Detail component",
      hidden: true,
    }),
    ...expandableBehaviorShape,
  }),
]) satisfies BlockOptionsFor<TableViewExpandableOptions>;

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
    { label: "Max height", group: "appearance" },
  ),
  expandable: ui(
    expandableSchema
      .optional()
      .describe("A caret column opens a detail band under each row."),
    { label: "Expandable rows", group: "features" },
  ),
  layout: ui(
    z
      .enum(["full", "compact"])
      .optional()
      .describe("Full dashboard grid, or the compact list of a settings page."),
    { label: "Layout", group: "appearance", widget: "segmented" },
  ),
  searchPlaceholder: ui(z.string().optional(), {
    label: "Search placeholder",
    group: "content",
  }),
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
    // Read straight off the fetched row: an unlisted field leaves every row
    // without an id, which breaks selection, edit, delete and copy-link.
    fieldAspect: "listable",
  }),
  labelKey: ui(
    z.string().optional().describe("Field naming a row in dialog titles."),
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
  // Each button's `target` holds a live component the factory calls
  // `serializeSync()` on, and `permission` may be an `Action`. Neither survives
  // a JSON round-trip, so the option is read-only here — the same reason
  // `rowActions.custom`, which has the identical shape, is hidden.
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
  queryParamFilters: ui(z.record(paramFilterSchema).optional(), {
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
  kanban: ui(kanbanSchema.optional(), { label: "Kanban", group: "advanced" }),
  card: ui(cardSchema.optional(), {
    label: "Cards",
    group: "advanced",
  }),
  displays: ui(z.array(displaySchema).optional(), {
    label: "Displays",
    group: "advanced",
  }),
  defaultDisplay: ui(z.string().default(TABLE_DISPLAY_ID), {
    label: "Default display",
    group: "advanced",
  }),
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
