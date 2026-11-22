import {
  type BlockOptionSchema,
  type BlockTypeDescriptor,
  GetBlockType,
  opaqueOption,
} from "@antelopejs/interface-dms/base/block-types";
import {
  type ColumnGroupConfig,
  TableView,
  type TableViewOptions,
  TableViewSchema,
  type TableViewSourceOptions,
} from "@antelopejs/interface-dms/base/table-view";
import { describeSchema } from "@antelopejs/interface-dms/base/block-registry/internal/describe";
import { z } from "zod";
import type { FixtureScope } from "./fixtures";
import { readOnlyForm, withFieldInputs } from "./form-fields";
import {
  checkFixture,
  dataUrl,
  fixtureKeyOf,
  parseRows,
  rewriteObject,
} from "./fixtures";
import type { JsonObject, MockupNode } from "./model";
import { jsonObjectSchema, zodIssues } from "./model";
import { rewriteLinkObject, rewriteLinks } from "./page-links";
import {
  archiveActionIssues,
  archiveModeRowActions,
  type DrawnActions,
  ruleArchiveMode,
} from "./table-archive";
import { type FormGroups, tableFormOptions } from "./table-forms";
import {
  buildColumn,
  COLUMN_DISPLAY_OPTION,
  columnSchema,
} from "./table-columns";
import {
  checkTableOptions,
  describeTableOptions,
  serializeTableOptions,
  strictTabsSchema,
  tableOptionsSchema,
} from "./table-options";
import {
  componentOptionsOf,
  previewOptionsOf,
  validateBlockOptions,
} from "./validate";

/**
 * How a mockup builds a block whose factory takes a controller class: what
 * its options are in a spec, and the node the preview draws from them.
 */
export interface ControllerBlock {
  /** The options a spec writes, described for the JSON Schema. */
  options(descriptor: BlockTypeDescriptor): Record<string, BlockOptionSchema>;
  compile(node: MockupNode, pointer: string, scope: FixtureScope): MockupNode;
}

const capabilitiesSchema = z
  .object({
    search: z.boolean().optional(),
    sort: z.boolean().optional(),
    paginate: z.boolean().optional(),
    filter: z.boolean().optional(),
  })
  .strict();

export const TABLE_SOURCE_PICKED = {
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
  archiveMode: true,
  archivedCountLabel: true,
} as const;

/** A group of a table's form fields, as `@ColumnGroup` declares it. */
const columnGroupSchema = z
  .object({
    label: z.string(),
    description: z.string().optional(),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
    order: z.number().optional(),
  })
  .strict() satisfies z.ZodType<ColumnGroupConfig>;

/** `TableView.fromSource` options as a spec writes them. */
const tableSourceSchema = TableViewSchema.pick(TABLE_SOURCE_PICKED)
  .extend({
    fetchUrl: z.string(),
    fetchRowUrl: z.string().optional(),
    periodScope: z.string().optional(),
    capabilities: capabilitiesSchema.optional(),
    formContainer: TableViewSchema.shape.formContainer,
    columns: z.record(z.string(), columnSchema),
    columnGroups: z.record(z.string(), columnGroupSchema).optional(),
    pagination: opaqueOption<TableViewOptions["pagination"]>().optional(),
    emptyStates: opaqueOption<TableViewOptions["emptyStates"]>().optional(),
    ...tableOptionsSchema.shape,
    tabs: strictTabsSchema.optional(),
  })
  .strict();

/** What the rows route does itself: it reads every parameter of the list query. */
const ROWS_CAPABILITIES = {
  search: true,
  sort: true,
  paginate: true,
  filter: true,
};

/** Where a table reads its rows: the route, and the page and key of the fixture holding them. */
interface TableRows {
  url: string;
  pageId: string;
  key: string;
}

function rowsOf(
  node: MockupNode,
  pointer: string,
  scope: FixtureScope,
): TableRows | undefined {
  const at = `${pointer}/fetchUrl`;
  const key = fixtureKeyOf(node.options?.fetchUrl);
  if (key === undefined) {
    scope.issues.push({
      path: at,
      message: 'a mockup table reads its rows from "fixture:<key>"',
    });
    return undefined;
  }
  const source = checkFixture(scope, key, at);
  if (!source) return undefined;
  if (!parseRows(source.value)) {
    scope.issues.push({
      path: at,
      message: `the fixture "${key}" is not an array of row objects`,
    });
    return undefined;
  }
  return { url: dataUrl(scope, key, "rows"), pageId: source.pageId, key };
}

type TableSource = z.infer<typeof tableSourceSchema>;

const DEFAULT_ROW_ID_KEY = "_id";

/**
 * A table's options with each `page:<id>` link rewritten: a link of a row
 * action passes the row's id, read at the table's `rowIdKey`. The spec pages
 * of `formContainer` are its forms', which {@link tableFormOptions} links.
 */
function linkedTableOptions(
  options: JsonObject,
  pointer: string,
  scope: FixtureScope,
): JsonObject {
  const { rowActions, formContainer, ...rest } = options;
  const linked = {
    ...rewriteLinkObject(rest, pointer, scope),
    ...(formContainer !== undefined && { formContainer }),
  };
  if (rowActions === undefined) return linked;
  const rowIdKey = z.string().catch(DEFAULT_ROW_ID_KEY).parse(options.rowIdKey);
  return {
    ...linked,
    rowActions: rewriteLinks(
      rowActions,
      `${pointer}/rowActions`,
      scope,
      `{{row.${rowIdKey}}}`,
    ),
  };
}

/**
 * The add, edit, details, archive and restore row actions the spec writes.
 * The interface's schema reads an absent action as on, which a mockup table,
 * read-only unless it asks, does not.
 */
function writtenActions(
  source: TableSource,
  written: JsonObject,
): DrawnActions {
  const actions = jsonObjectSchema.catch({}).parse(written.rowActions);
  const pick = <Key extends keyof DrawnActions>(key: Key) =>
    Object.hasOwn(actions, key) ? source.rowActions?.[key] : undefined;
  return {
    add: pick("add"),
    edit: pick("edit"),
    details: pick("details"),
    archive: pick("archive"),
    restore: pick("restore"),
  };
}

/**
 * The options a table's archive mode adds beside its row actions, as the real
 * `TableView` serves them: the mode and the archive count's label. None
 * without `archiveMode`.
 */
function archiveModeOptions(source: TableSource): JsonObject {
  if (!source.archiveMode) return {};
  return {
    archiveMode: true,
    ...(source.archivedCountLabel !== undefined && {
      archivedCountLabel: source.archivedCountLabel,
    }),
  };
}

/** The groups of a table's form fields: each column's `group`, and the `columnGroups` declaring them. */
function formGroups(
  columns: TableSource["columns"],
  declared: TableSource["columnGroups"],
): FormGroups {
  return {
    ofColumn: new Map(
      Object.entries(columns).flatMap(([key, { group }]) =>
        group === undefined ? [] : [[key, group]],
      ),
    ),
    declared: new Map(Object.entries(declared ?? {})),
  };
}

function buildTable(
  source: TableSource,
  written: JsonObject,
  rows: TableRows,
  pointer: string,
  scope: FixtureScope,
): JsonObject | undefined {
  const columns: TableViewSourceOptions["columns"] = {};
  for (const [key, column] of Object.entries(source.columns)) {
    const built = buildColumn(column, key, `${pointer}/columns/${key}`);
    if (built.ok) columns[key] = built.column;
    else scope.issues.push(...built.issues);
  }
  if (Object.keys(columns).length !== Object.keys(source.columns).length) {
    return undefined;
  }
  const {
    kanban,
    grouped,
    views,
    tabsFrom,
    defaultDisplay,
    mobileDisplay,
    formContainer,
    archiveMode,
    archivedCountLabel: _archivedCountLabel,
    columnGroups,
    ...fromSource
  } = source;
  const actions = writtenActions(source, written);
  const checked = checkTableOptions(
    source,
    { written: source.columns, built: columns },
    pointer,
  );
  if (checked.issues.length > 0) {
    scope.issues.push(...checked.issues);
    return undefined;
  }
  if (!archiveMode) scope.issues.push(...archiveActionIssues(actions, pointer));
  const ruled = archiveMode ? ruleArchiveMode(actions) : actions;
  try {
    const built = TableView.fromSource({
      ...fromSource,
      tabs: checked.tabs,
      fetchUrl: rows.url,
      capabilities: source.capabilities ?? ROWS_CAPABILITIES,
      columns,
    }).serializeSync();
    const where = `TableView.fromSource(${rows.url})`;
    const options = jsonObjectSchema.safeParse(
      JSON.parse(
        JSON.stringify({
          ...built.options,
          ...serializeTableOptions(source, where),
        }),
      ),
    );
    if (!options.success) return undefined;
    const forms = tableFormOptions(
      {
        rowActions: {
          add: ruled.add,
          edit: ruled.edit,
          details: ruled.details,
        },
        formContainer,
        columns,
        groups: formGroups(source.columns, columnGroups),
        rowIdKey: source.rowIdKey,
        rows,
      },
      pointer,
      scope,
    );
    const rowActions = jsonObjectSchema.safeParse(options.data.rowActions);
    const formActions = jsonObjectSchema.safeParse(forms.rowActions);
    return {
      ...options.data,
      ...forms,
      ...archiveModeOptions(source),
      rowActions: {
        ...(rowActions.success && rowActions.data),
        ...(formActions.success && formActions.data),
        ...(archiveMode && archiveModeRowActions(ruled)),
      },
    };
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
    caption: {
      type: "string",
      optional: true,
      description:
        'The title of the table, such as "Orders". A mockup table needs one: without it the real table moves its status tabs into the header and draws the views strip under them.',
    },
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
          filterable: { type: "boolean", optional: true },
          order: { type: "number", optional: true },
          display: COLUMN_DISPLAY_OPTION,
          group: {
            type: "string",
            optional: true,
            description:
              "The id of the group the column's field joins in the add, edit and details forms, as @Column({ group }): the group's fields are gathered where its first column stands, under its columnGroups label, else its id.",
          },
        },
      },
    },
    columnGroups: {
      ...describeSchema(z.record(z.string(), columnGroupSchema)),
      optional: true,
      description:
        "Each form group's title and layout, by the id the columns' group names, as @ColumnGroup(id, config) declares it on a controller.",
    },
    capabilities: {
      type: "object",
      optional: true,
      description:
        "Defaults to search, sort, paginate and filter, all on: the rows route applies tabs, quick filters and column filters. A table that sets it keeps its own value, and tabs, quick filters and queryParamFilters need filter: true.",
    },
    ...(descriptor.config.formContainer && {
      formContainer: {
        ...descriptor.config.formContainer,
        description:
          'Where the forms of rowActions add, edit and details open. "modal", the default, or "drawer" draws a form over the columns: add and edit close on save and keep nothing, details shows the row read-only. Prefer it for details. A drawer slides in from the bottom, or from the right with direction: "right". "page" opens each form on a page of its own, for a long record or a long or sectioned form: by default a generated page holding the generated form, read-only for details, with a Cancel back to the table, which pages.new, pages.edit and pages.details may title with a displayName and a description, with no spec page to write; or, for a details page that adds something, such as KPIs or related lists, the spec page the entry names: { "urlSlug": "page:<id>", "customPage": true }, whose edit and details pages take a route, ":id", and receive the row\'s id. A ResourceForm on the details page is in mode "view", on the edit page in mode "edit".',
      },
    }),
    ...(descriptor.config.archiveMode && {
      archiveMode: {
        ...descriptor.config.archiveMode,
        description:
          'Archive mode, drawn as the real TableView draws it: a "Show archived" toggle above the rows, archive on the rows not archived and restore on the archived ones, edit only on the rows not archived. A row is archived when its isArchived field is true; a fixture whose rows have no isArchived gets the last quarter of its rows archived. rowActions archive and restore need it.',
      },
    }),
    ...describeTableOptions(),
  }),
  compile(node, pointer, scope) {
    const optionsAt = `${pointer}/options`;
    const written = linkedTableOptions(node.options ?? {}, optionsAt, scope);
    const rows = rowsOf(node, optionsAt, scope);
    const parsed = tableSourceSchema.safeParse(written);
    if (!parsed.success)
      scope.issues.push(...zodIssues(optionsAt, parsed.error));
    const options =
      rows && parsed.success
        ? buildTable(parsed.data, written, rows, optionsAt, scope)
        : undefined;
    return { ...node, options: options ?? written };
  },
};

const FORM_TYPE = "Form";

/** The `ResourceForm` mode that shows a row read-only. */
const VIEW_MODE = "view";

/**
 * A serialized form reading one fixture record and saving nowhere: the
 * preview draws it as a `Form`, so it is checked as one. In `view` mode every
 * field is disabled, as the real `ResourceForm` shows a row read-only.
 */
const resourceForm: ControllerBlock = {
  options() {
    const form = GetBlockType(FORM_TYPE);
    return form ? previewOptionsOf(form) : {};
  },
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
    if (!form) return { ...node, options };
    validateBlockOptions(form, node, options, optionsAt, scope.issues);
    const filled = withFieldInputs(form, options, optionsAt, scope.issues);
    const drawn = written.mode === VIEW_MODE ? readOnlyForm(filled) : filled;
    return { ...node, options: componentOptionsOf(form, drawn) };
  },
};

/** The controller blocks a mockup can build, keyed by block type. */
export const CONTROLLER_BLOCKS = new Map<string, ControllerBlock>([
  ["TableView", tableView],
  ["ResourceForm", resourceForm],
]);
