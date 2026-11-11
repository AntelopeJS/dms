import {
  type BlockOptionSchema,
  type BlockTypeDescriptor,
  GetBlockType,
  opaqueOption,
} from "@antelopejs/interface-dms/base/block-types";
import { CreateDataType } from "@antelopejs/interface-dms/base/data-types";
import {
  TableView,
  type TableViewOptions,
  TableViewSchema,
  type TableViewSourceOptions,
} from "@antelopejs/interface-dms/base/table-view";
import { z } from "zod";
import type { FixtureScope } from "./fixtures";
import {
  checkFixture,
  fixtureKeyOf,
  fixtureUrl,
  parseRows,
  rewriteObject,
} from "./fixtures";
import type { JsonObject, MockupNode } from "./model";
import { jsonObjectSchema, zodIssues } from "./model";
import { validateBlockOptions } from "./validate";

/**
 * How a mockup builds a block whose factory takes a controller class: what
 * its options are in a spec, and the node the preview draws from them.
 */
export interface ControllerBlock {
  /** The options a spec writes, described for the JSON Schema. */
  options(descriptor: BlockTypeDescriptor): Record<string, BlockOptionSchema>;
  compile(node: MockupNode, pointer: string, scope: FixtureScope): MockupNode;
}

const columnSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    type: z.string(),
    order: z.number().optional(),
    isVisible: z.boolean().optional(),
    filterable: z.boolean().optional(),
    cellWrap: z.boolean().optional(),
    size: z.number().optional(),
    sortable: z.boolean().optional(),
  })
  .strict();

const capabilitiesSchema = z
  .object({
    search: z.boolean().optional(),
    sort: z.boolean().optional(),
    paginate: z.boolean().optional(),
    filter: z.boolean().optional(),
  })
  .strict();

const TABLE_SOURCE_PICKED = {
  caption: true,
  layout: true,
  density: true,
  maxHeight: true,
  rowClick: true,
  pageSize: true,
  searchPlaceholder: true,
  searchShortcut: true,
  labelKey: true,
  customButtons: true,
  displays: true,
  defaultDisplay: true,
  mobileDisplay: true,
  card: true,
  expandable: true,
  tabs: true,
  quickFilters: true,
  defaultSort: true,
  pinnedRows: true,
  realtimeTopic: true,
  liveHold: true,
  queryParamFilters: true,
  rowIdKey: true,
  rowActions: true,
  footer: true,
} as const;

/** `TableView.fromSource` options as a spec writes them. */
const tableSourceSchema = TableViewSchema.pick(TABLE_SOURCE_PICKED)
  .extend({
    fetchUrl: z.string(),
    fetchRowUrl: z.string().optional(),
    periodScope: z.string().optional(),
    capabilities: capabilitiesSchema.optional(),
    columns: z.record(columnSchema),
    pagination: opaqueOption<TableViewOptions["pagination"]>().optional(),
    emptyStates: opaqueOption<TableViewOptions["emptyStates"]>().optional(),
  })
  .strict();

/** What the rows route does itself: everything but column filters. */
const ROWS_CAPABILITIES = { search: true, sort: true, paginate: true };

const ROWS_SUFFIX = "/rows";

function rowsUrlOf(
  node: MockupNode,
  pointer: string,
  scope: FixtureScope,
): string | undefined {
  const at = `${pointer}/fetchUrl`;
  const key = fixtureKeyOf(node.options?.fetchUrl);
  if (key === undefined) {
    scope.issues.push({
      path: at,
      message: 'a mockup table reads its rows from "fixture:<key>"',
    });
    return undefined;
  }
  if (!checkFixture(scope, key, at)) return undefined;
  if (!parseRows(scope.fixtures[key])) {
    scope.issues.push({
      path: at,
      message: `the fixture "${key}" is not an array of row objects`,
    });
    return undefined;
  }
  return `${fixtureUrl(scope.name, scope.pageId, key)}${ROWS_SUFFIX}`;
}

type TableSource = z.infer<typeof tableSourceSchema>;

function buildTable(
  source: TableSource,
  rowsUrl: string,
  pointer: string,
  scope: FixtureScope,
): JsonObject | undefined {
  const columns: TableViewSourceOptions["columns"] = {};
  for (const [key, column] of Object.entries(source.columns)) {
    try {
      const type = CreateDataType(column.type);
      columns[key] = { ...column, name: column.name ?? key, type };
    } catch {
      scope.issues.push({
        path: `${pointer}/columns/${key}/type`,
        message: `no data type is registered as "${column.type}"`,
      });
    }
  }
  if (Object.keys(columns).length !== Object.keys(source.columns).length) {
    return undefined;
  }
  try {
    const built = TableView.fromSource({
      ...source,
      fetchUrl: rowsUrl,
      capabilities: source.capabilities ?? ROWS_CAPABILITIES,
      columns,
    }).serializeSync();
    const options = jsonObjectSchema.safeParse(
      JSON.parse(JSON.stringify(built.options)),
    );
    return options.success ? options.data : undefined;
  } catch (error) {
    scope.issues.push({
      path: pointer,
      message: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * `TableView.fromSource` over a fixture's rows, built by the real factory.
 * A table that does not build is emitted with its options as written, which
 * the preview shows as a block that needs a backend.
 */
const tableView: ControllerBlock = {
  options: (descriptor) => ({
    ...Object.fromEntries(
      Object.entries(descriptor.config).filter(([key]) =>
        Object.hasOwn(TABLE_SOURCE_PICKED, key),
      ),
    ),
    fetchUrl: {
      type: "string",
      description: '"fixture:<key>" naming an array of row objects.',
    },
    columns: {
      type: "record",
      description: "The columns, keyed by row field.",
      values: {
        type: "object",
        properties: {
          name: { type: "string", optional: true },
          type: {
            type: "string",
            description: 'A data type id: "string", "number", "date"...',
          },
          sortable: { type: "boolean", optional: true },
          order: { type: "number", optional: true },
        },
      },
    },
    capabilities: {
      type: "object",
      optional: true,
      description: "Defaults to search, sort and paginate, all on.",
    },
  }),
  compile(node, pointer, scope) {
    const optionsAt = `${pointer}/options`;
    const written = node.options ?? {};
    const rowsUrl = rowsUrlOf(node, optionsAt, scope);
    const parsed = tableSourceSchema.safeParse(written);
    if (!parsed.success)
      scope.issues.push(...zodIssues(optionsAt, parsed.error));
    const options =
      rowsUrl && parsed.success
        ? buildTable(parsed.data, rowsUrl, optionsAt, scope)
        : undefined;
    return { ...node, options: options ?? written };
  },
};

const FORM_TYPE = "Form";

/**
 * A serialized form reading one fixture record and saving nowhere: the
 * preview draws it as a `Form`, so it is checked as one.
 */
const resourceForm: ControllerBlock = {
  options: () => GetBlockType(FORM_TYPE)?.config ?? {},
  compile(node, pointer, scope) {
    const optionsAt = `${pointer}/options`;
    const written = node.options ?? {};
    if (fixtureKeyOf(written.fetchUrl) === undefined) {
      scope.issues.push({
        path: `${optionsAt}/fetchUrl`,
        message: 'a mockup form reads its record from "fixture:<key>"',
      });
    }
    if (Object.hasOwn(written, "submitUrl")) {
      scope.issues.push({
        path: `${optionsAt}/submitUrl`,
        message: "a mockup form saves nowhere: leave submitUrl out",
      });
    }
    const options = rewriteObject(written, optionsAt, scope);
    const form = GetBlockType(FORM_TYPE);
    if (form)
      validateBlockOptions(form, node, options, optionsAt, scope.issues);
    return { ...node, options };
  },
};

/** The controller blocks a mockup can build, keyed by block type. */
export const CONTROLLER_BLOCKS = new Map<string, ControllerBlock>([
  ["TableView", tableView],
  ["ResourceForm", resourceForm],
]);
