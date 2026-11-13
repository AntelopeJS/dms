import {
  AddField,
  ConfigureField,
  CreateResource,
  DeleteResource,
  GetResourceStructure,
  ListResources,
  RemoveField,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool } from "../tool";
import {
  BUILDER_REF_NOTE,
  containsExprSentinel,
  exprRefusal,
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
    "Returns a resource's fields with their semantic aspects, its `routes` (absent when it serves the full set), and a version hash for optimistic concurrency. Hand-edited or relation fields come back marked `opaque` — safe mode cannot reconfigure those.",
  ),
  effect: "read",
  input: z.object({ ref: z.string() }),
  run: async ({ ref }) => opResult(await GetResourceStructure(ref)),
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
  run: async (args) =>
    repeatConfirmation.hold("builder_delete_resource", args) ??
    opResult(
      await DeleteResource(
        args.ref,
        args.keepData === undefined ? undefined : { keepData: args.keepData },
      ),
    ),
});

const addField = defineTool({
  name: "builder_add_field",
  title: "Add field",
  description: withEscalationNote(
    "Adds a field to a resource, editing the Table and DataAPI classes together in one atomic op.",
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
    "Reconfigures a field by merging the patch over its current aspects and re-deriving the whole decorator stack on both classes (no drift). Field name is immutable — rename via builder_remove_field + builder_add_field.",
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
  run: async (args) =>
    repeatConfirmation.hold("builder_remove_field", args) ??
    opResult(await RemoveField(args.path)),
});

export const BUILDER_RESOURCE_TOOLS = [
  listResources,
  resourceStructure,
  createResource,
  deleteResource,
  addField,
  configureField,
  removeField,
];
