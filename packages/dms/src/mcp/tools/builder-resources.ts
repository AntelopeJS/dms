import {
  AddField,
  ConfigureColumnGroups,
  ConfigureField,
  CreateResource,
  DeleteResource,
  GetResourceStructure,
  ListResources,
  RemoveField,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { CELL_DISPLAYS } from "../../implementations/dms-builder/engine/cell-displays";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool } from "../tool";
import {
  BUILDER_REF_NOTE,
  containsExprSentinel,
  exprRefusal,
  shownStructures,
  withEscalationNote,
  opResult,
  TARGET_MODULE,
} from "./builder-shared";

const FIELD_PATH = z
  .string()
  .describe(
    "A field path `<resourceRef>#<fieldName>` (the `ref` from builder_list_resources plus the field name).",
  );

const DATA_TYPE_VALUE = z.object({
  $dataType: z
    .string()
    .describe(
      "A `dataTypes` id from builder_catalog, e.g. `string`, `select`.",
    ),
  config: JsonObjectSchema.optional().describe(
    `That DataType's own config, per builder_catalog. ${BUILDER_REF_NOTE}`,
  ),
});

/** The ids of the cell displays the DMS draws, as the tool descriptions list them. */
const CELL_DISPLAY_IDS = [...CELL_DISPLAYS.keys()].join(", ");

/** A cell display of the TableView, `{ type, options }`, as the builder and a mockup spec take it. */
export const CELL_DISPLAY = z
  .object({
    type: z
      .string()
      .describe(
        `The id of one of the DMS's cell displays: ${CELL_DISPLAY_IDS}.`,
      ),
    options: JsonObjectSchema.optional().describe(
      "The options of that display's DefaultDisplays class (identity: avatarField, subtitleField, badges…; two_line: primaryField, subField…; status_pill: tones, toneField…; progress: doneField and totalField). An option the class does not take is refused.",
    ),
  })
  .describe(
    "How table cells draw the value, written as `@Column({ display: new DefaultDisplays.<Class>(options) })`. The column keeps its dataType for its forms, filters and exports.",
  );

/** The `@Column` options that present a column, as builder_add_field and builder_map_resources take them. */
export const COLUMN_PRESENTATION = {
  description: z.string().optional().describe("The column's help text."),
  group: z
    .string()
    .optional()
    .describe(
      "The id of the form group the field joins (`@Column({ group })`); declare its title with builder_configure_column_groups.",
    ),
  isVisible: z
    .boolean()
    .optional()
    .describe(
      "False hides the column until the person picks it. Default true.",
    ),
  size: z
    .number()
    .positive()
    .optional()
    .describe("Default width of the grid column, in px (150 when left out)."),
  cellWrap: z
    .boolean()
    .optional()
    .describe("Wrap the cell's content without a line limit."),
};

const PRESENTATION_PATCH = {
  description: COLUMN_PRESENTATION.description.unwrap().nullable().optional(),
  group: COLUMN_PRESENTATION.group.unwrap().nullable().optional(),
  isVisible: COLUMN_PRESENTATION.isVisible.unwrap().nullable().optional(),
  size: COLUMN_PRESENTATION.size.unwrap().nullable().optional(),
  cellWrap: COLUMN_PRESENTATION.cellWrap.unwrap().nullable().optional(),
  display: CELL_DISPLAY.nullable().optional(),
};

const FIELD_ASPECTS = {
  dataType: DATA_TYPE_VALUE,
  label: z
    .string()
    .optional()
    .describe("Column header. Defaults to the field name."),
  listable: z
    .boolean()
    .optional()
    .describe("Show in list/table responses. Default true."),
  searchable: z.boolean().optional().describe("Include in free-text search."),
  sortable: z.boolean().optional().describe("Allow sorting by this field."),
  filterable: z.boolean().optional().describe("Allow filtering by this field."),
  access: z
    .enum(["read", "readwrite"])
    .optional()
    .describe("`read` makes it write-protected. Default `readwrite`."),
  required: z.boolean().optional().describe("Reject writes omitting it."),
  indexed: z.boolean().optional().describe("Add a database index."),
  order: z
    .number()
    .optional()
    .describe("Position among the resource's fields."),
  ...COLUMN_PRESENTATION,
  display: CELL_DISPLAY.optional(),
};

const FIELD_SPEC = z.object({
  name: z
    .string()
    .describe(
      "Field name. Must not be one of builder_catalog's `reservedFieldNames` (they collide with a generated route or Model member) — e.g. use `itemCount`, not `count`.",
    ),
  ...FIELD_ASPECTS,
});

const FIELD_ASPECTS_PATCH = z.object({
  ...FIELD_ASPECTS,
  ...PRESENTATION_PATCH,
  dataType: DATA_TYPE_VALUE.optional(),
});

const RESOURCE_LOCATION = z
  .union([
    z.string(),
    z.object({ category: z.string() }),
    z.object({ page: z.string() }),
  ])
  .describe(
    "Where the resource folder goes: a `dir` string relative to src root, `{ category: <CategoryRef> }` (mirrors page placement), or `{ page: <PageRef> }` (nests beside that page). Omit for `src/<name>/`.",
  );

const RESOURCE_ROUTE = z
  .enum([
    "list",
    "get",
    "create",
    "edit",
    "delete",
    "select",
    "archive",
    "export",
  ])
  .describe(
    "A DataAPI route: `list` (paginated listing), `get` (read one), `create`, `edit`, `delete`, `select` (relation-picker options), `archive` (soft delete + undo), `export` (CSV).",
  );

const listResources = defineTool({
  name: "builder_list_resources",
  title: "List resources",
  description: withEscalationNote(
    "Lists every data resource (its ref, class/table names, /api route, field count, files). A resource is a Database Table+Model paired with a DataAPI controller.",
  ),
  effect: "read",
  input: z.object({}),
  run: async () => opResult(await ListResources()),
});

const resourceStructure = defineTool({
  name: "builder_resource_structure",
  title: "Resource structure",
  description: withEscalationNote(
    "Returns a resource's fields with their semantic aspects (a cell display reads `display: { type, options }`, beside `group`, `isVisible`, `size`, `cellWrap` and `description`), its `columnGroups` by id, its `routes` (absent when it serves the full set), and a version hash for optimistic concurrency. Hand-edited or relation fields come back marked `opaque` — safe mode cannot reconfigure those. In a module mapped from a connected database, a badge's select reads its items from a column (`itemsFrom: { column }`, `items: []`) and a price may read its currency from one (`currencyFrom: { column }`): the DMS reads those values from the rows when it serves the page. A select's `items` and a price's `currency` that a mapping wrote before that read `{ $hidden: n }`, n the values it read from rows: leave `dataType` out of a patch to keep them. The ones you wrote read as written.",
  ),
  effect: "read",
  input: z.object({ ref: z.string() }),
  async run({ ref }) {
    const answer = await GetResourceStructure(ref);
    if (!answer.ok) return opResult(answer);
    const { shownResourceStructure } = await shownStructures();
    return opResult({ ...answer, data: shownResourceStructure(answer.data) });
  },
});

const createResource = defineTool({
  name: "builder_create_resource",
  title: "Create resource",
  description: withEscalationNote(
    "Creates a data resource — a Database Table+Model plus a matching DataAPI controller at /api/<name> — as a folder wired into the nearest barrel. Every resource auto-manages its own `_id`. When you limit `routes`, keep the view in sync: drop the TableView rowActions whose routes you left out, or bind a Form instead.",
  ),
  effect: "builder",
  input: z.object({
    name: z.string(),
    displayName: z.string().optional(),
    schema: z.string().optional(),
    fields: z.array(FIELD_SPEC),
    seeds: z.array(JsonObjectSchema).optional(),
    location: RESOURCE_LOCATION.optional(),
    routes: z.array(RESOURCE_ROUTE).min(1).optional(),
    module: TARGET_MODULE,
  }),
  run: async (input) =>
    containsExprSentinel.parse(input)
      ? exprRefusal()
      : opResult(await CreateResource(input)),
});

const deleteResource = defineTool({
  name: "builder_delete_resource",
  title: "Delete resource",
  description: withEscalationNote(
    "Deletes a resource: removes its database.ts/data-api.ts/index.ts files, unwires the barrel export, and (by default) clears the resource's database table so a later resource reusing the name re-seeds cleanly instead of inheriting stale rows. Pass keepData: true to leave the table data in place. Does not detect pages whose TableView references its /api route.",
  ),
  effect: "project",
  input: z.object({ ref: z.string(), keepData: z.boolean().optional() }),
  run: async (args, sessionId) =>
    repeatConfirmation.run(
      sessionId,
      "builder_delete_resource",
      args,
      async () =>
        opResult(
          await DeleteResource(
            args.ref,
            args.keepData === undefined
              ? undefined
              : { keepData: args.keepData },
          ),
        ),
    ),
});

const addField = defineTool({
  name: "builder_add_field",
  title: "Add field",
  description: withEscalationNote(
    "Adds a field to a resource, editing the Table and DataAPI classes together in one atomic op. Its `@Column` takes the presentation a mockup column declares: `display` (a cell display `{ type, options }`), `group`, `isVisible`, `size`, `cellWrap` and `description`. A display whose options its class does not take is refused with invalid_config.",
  ),
  effect: "builder",
  input: z.object({ ref: z.string(), field: FIELD_SPEC }),
  run: async ({ ref, field }) =>
    containsExprSentinel.parse(field)
      ? exprRefusal()
      : opResult(await AddField(ref, field)),
});

const configureField = defineTool({
  name: "builder_configure_field",
  title: "Configure field",
  description: withEscalationNote(
    "Reconfigures a field by merging the patch over its current aspects and re-deriving the whole decorator stack on both classes (no drift). Field name is immutable — rename via builder_remove_field + builder_add_field. The presentation options (`display`, `group`, `isVisible`, `size`, `cellWrap`, `description`) are replaced when sent and removed when sent as null; a display whose options its class does not take is refused with invalid_config.",
  ),
  effect: "builder",
  input: z.object({ path: FIELD_PATH, patch: FIELD_ASPECTS_PATCH }),
  run: async ({ path, patch }) =>
    containsExprSentinel.parse(patch)
      ? exprRefusal()
      : opResult(await ConfigureField(path, patch)),
});

const removeField = defineTool({
  name: "builder_remove_field",
  title: "Remove field",
  description: withEscalationNote(
    "Removes a field from a resource's Table and DataAPI classes in one atomic op. Leaves seed rows untouched.",
  ),
  effect: "builder",
  input: z.object({ path: FIELD_PATH }),
  run: async (args, sessionId) =>
    repeatConfirmation.run(sessionId, "builder_remove_field", args, async () =>
      opResult(await RemoveField(args.path)),
    ),
});

const COLUMN_GROUP = z.object({
  label: z.string().min(1).describe("The group's title in the forms."),
  description: z.string().optional(),
  orientation: z
    .enum(["horizontal", "vertical"])
    .optional()
    .describe("How the group lays its fields out."),
  order: z
    .number()
    .optional()
    .describe("Where the group sorts among the others."),
});

const configureColumnGroups = defineTool({
  name: "builder_configure_column_groups",
  title: "Configure column groups",
  description: withEscalationNote(
    "Writes or removes the `@ColumnGroup(id, { label, description?, orientation?, order? })` decorators on a resource's DataAPI controller: the titles and layouts of the form groups its fields join with `group`. A group sent replaces the one of its id, `null` removes it, and groups left out stay. builder_resource_structure reads them back as `columnGroups`.",
  ),
  effect: "builder",
  input: z.object({
    resource: z
      .string()
      .describe("The resource's `ref`, from builder_list_resources."),
    groups: z
      .record(COLUMN_GROUP.nullable())
      .describe("The groups to write by id; null removes that group."),
  }),
  run: async ({ resource, groups }) =>
    opResult(await ConfigureColumnGroups(resource, groups)),
});

export const BUILDER_RESOURCE_TOOLS = [
  listResources,
  resourceStructure,
  createResource,
  deleteResource,
  addField,
  configureField,
  configureColumnGroups,
  removeField,
];
