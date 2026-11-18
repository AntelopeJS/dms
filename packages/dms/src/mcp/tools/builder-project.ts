import { setTimeout as delay } from "node:timers/promises";
import {
  AnalyseDatabase,
  type AnalysisState,
  type ColumnDisplay,
  ConfigureProject,
  GetAnalysis,
  GetMapping,
  MapResources,
  type MapResourcesInput,
  type MapResourcesResult,
  type MappedResource,
  type OpResult,
  PreviewMapResources,
  type ProjectConfigResult,
} from "@antelopejs/interface-dms-builder";
import type { ConnectionAccess } from "@antelopejs/interface-dms/connection-access";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool, type McpToolResult, textResult } from "../tool";
import { summariseAnalysis } from "../analysis-summary";
import {
  type RedactedData,
  redactAnalysis,
  redactedResult,
  redactMapping,
} from "../redact";
import { opResult, refusalResult, redactedOpResult } from "./builder-shared";
import { TABLE_VIEW_SETTINGS } from "./builder-table-view";

const ANALYSIS_WAIT_MS = 60_000;
const ANALYSIS_POLL_MS = 1_000;
const UNAPPROVED_PAGES_PREFIX = "pages not approved for removal";

const IMPORT_OVERRIDE = z.object({
  interface: z.string(),
  source: z.string().optional(),
  id: z.string().optional(),
});

const MODULE_ENTRY = z
  .object({
    source: JsonObjectSchema.optional(),
    config: JsonObjectSchema.optional(),
    env: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Config path under the module's `config` → the NAME of the environment variable that supplies it, e.g. `{ url: \"ERP_DATABASE_URL\" }`. Never put a secret's value anywhere in a step.",
      ),
    importOverrides: z.array(IMPORT_OVERRIDE).optional(),
    exportPriority: z.record(z.string(), z.number()).optional(),
  })
  .describe("What to write into the module's entry of antelope.config.ts.");

const STEP = z.discriminatedUnion("op", [
  z.object({ op: z.literal("AddModule"), id: z.string(), entry: MODULE_ENTRY }),
  z.object({
    op: z.literal("ConfigureModule"),
    id: z.string(),
    entry: MODULE_ENTRY,
  }),
  z.object({
    op: z.literal("CreateLocalModule"),
    id: z.string(),
    path: z
      .string()
      .describe("Relative to the project root, e.g. `modules/erp-tables`."),
    entry: MODULE_ENTRY.optional(),
    connection: z
      .string()
      .optional()
      .describe(
        "The catalog connection whose tables the module holds, e.g. `erp`: the Builder's Database panel then edits and removes the module with that connection.",
      ),
  }),
]);

const MAPPED_FIELD = z.object({
  column: z.string(),
  declared: z
    .string()
    .optional()
    .describe(
      "One of the column's `accepts`, from the proposal or database_describe; the first by default.",
    ),
  label: z.string().optional(),
  listable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  searchable: z.boolean().optional(),
  relation: z
    .string()
    .nullable()
    .optional()
    .describe(
      "`schema.name` of another relation in this call, or one the module mapped before: makes the column a relation column onto that relation's single-column key. Left out, a declared foreign key onto such a relation (with a TableView) becomes one anyway; null keeps the column a plain value.",
    ),
  display: z
    .union([
      z.object({
        kind: z.literal("badge"),
        values: z
          .number()
          .optional()
          .describe(
            "How many values the badge draws, as the proposal and builder_mapping show it; read, never written.",
          ),
        items: z
          .array(
            z.object({
              value: z.string(),
              label: z.string(),
              tone: z.enum([
                "neutral",
                "primary",
                "secondary",
                "success",
                "warning",
                "error",
                "info",
              ]),
            }),
          )
          .optional()
          .describe(
            "Never written into the code: a mapped badge reads its values from the column's rows when the page is served, labelled and toned by the DMS. Left out, the column is a badge when the relation's mapping holds one, else when its analysis proposes one; with neither, the column is written plain.",
          ),
      }),
      z.object({
        kind: z.literal("price"),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional()
          .describe(
            "ISO 4217 code of the amount (`USD`). Left out, the field is sent as if it left `display` out: it takes the display the relation's mapping holds or its analysis proposes, a price in the currency the column comment states, else in the one its relation's currency column holds, read from the rows when the page is served, and with neither it is written plain. Send a code to write a price neither holds; a relation with a currency column reads that column instead.",
          ),
      }),
    ])
    .nullable()
    .optional()
    .describe(
      "How the column is drawn: a `badge` on a text column of few values, a `price` on an amount. The proposal's display when left out; `null` writes the column plain. A badge's values are never shown to you: send the badge back as the proposal or builder_mapping shows it, `{ kind: \"badge\", values: 3 }`.",
    ),
});

const MAPPED_RESOURCE = z.object({
  relation: z.string().describe("`schema.name`."),
  className: z.string().optional(),
  label: z
    .string()
    .optional()
    .describe(
      "The column relation columns pointing here show; also the TableView's labelKey.",
    ),
  title: z
    .string()
    .optional()
    .describe(
      "The page's title and the table's caption. Left out or blank, a new page takes the relation's name, humanized, and a page mapped before keeps its title.",
    ),
  category: z
    .string()
    .optional()
    .describe(
      "The id of a category made with builder_create_category, with this call's `module`: the page is written in it. A category that does not exist, or that another module declares, refuses this relation, naming it. Left out, a new page goes in the connection's category and a page mapped before stays where it is, even moved to another category: it is found by its table, not by its route. Sent on a page mapped before, it moves the page there, and its route changes.",
    ),
  tableView: z
    .boolean()
    .describe("False for a stats-only relation; forced false without a key."),
  writable: z
    .boolean()
    .describe(
      "False serves the TableView without new, edit and delete. True is refused while the connection's access is `read`.",
    ),
  fields: z.array(MAPPED_FIELD),
  tabs: z
    .object({ column: z.string() })
    .nullable()
    .optional()
    .describe(
      "Tabs above the table by a filterable badge column: All, then one per value. The proposal's tabs when left out; `null` writes none.",
    ),
  icon: z
    .string()
    .optional()
    .describe(
      "The page's menu icon, an icon name such as `i-ph-shopping-cart`.",
    ),
  description: z
    .string()
    .optional()
    .describe("What the page is for, in a sentence."),
  order: z
    .number()
    .optional()
    .describe(
      "Sorts the page among its category's pages, lowest first. 100 by default, so a dashboard created with order 0 comes before the mapped tables.",
    ),
  tableOptions: z
    .object(TABLE_VIEW_SETTINGS)
    .optional()
    .describe(
      "Displays (kanban, cards, grouped), views and footer figures for the page's table, with the same checks as builder_configure_table_view; a refused choice is a warning and the page keeps what it had.",
    ),
});

const CONNECTION = z
  .string()
  .describe("A connection id from database_connections.");
const BOUND_MODULE = z
  .string()
  .describe("The project module bound to the connection's database.");

/** What the project lets the dashboard do on a connection, read from its configuration now. */
async function currentAccess(connection: string): Promise<ConnectionAccess> {
  const { connectionAccess, withConnectionAccess } =
    await import("../../implementations/dms-builder/engine");
  return withConnectionAccess(() => connectionAccess(connection).access);
}

/**
 * An answer about one connection as the AI reads it, `redact` applied to its data, with `access`
 * beside it once it succeeded.
 */
async function answerWithAccess<T>(
  answer: OpResult<T>,
  connection: string | undefined,
  redact: (data: T) => RedactedData | ProjectConfigResult,
): Promise<McpToolResult> {
  const shown = redactedResult(answer, redact);
  if (!answer.ok || connection === undefined) {
    return textResult(JSON.stringify(shown), !answer.ok);
  }
  return textResult(
    JSON.stringify({ ...shown, access: await currentAccess(connection) }),
  );
}

const configureProject = defineTool({
  name: "builder_configure_project",
  title: "Configure project",
  description:
    "Edits antelope.config.ts in one step: adds modules (AddModule), merges into existing ones (ConfigureModule: config, importOverrides pins and connections, exportPriority, env variable names) and scaffolds local modules (CreateLocalModule). To connect a database, plan the batch from database_project: its driver package and range, a tables module pinned to the driver, the catalog connection on `self`, the dms-database step registering the connection with `config.externalConnections.<id>.access` set to `read`, and the pins it names. Before you connect one, ask the person whether the dashboard may only read that database or also change its rows: write `read` either way, and if they chose read & write, call builder_set_connection_access once the restarted project lists the connection in database_connections. Every step is validated before anything is written, and a refused step writes nothing. The user always approves the change, shown as a diff. A restart is needed before new modules load. It never raises an external connection's access: a step that sets `config.externalConnections.<id>.access` to `read-write` where the module's entry in antelope.config.ts does not already hold the literal string `read-write`, to anything else but `read`, supplies it from a variable, or rebinds a variable `envOverrides` maps to it, is refused. Keeping, lowering or removing an access works, so restate the connections you do not change. Raise one with builder_set_connection_access, once the person agrees; a person also grants writes in the Database module's Data browser or the assistant's connect step. A database driver's connection target is never written as a value: a step that writes anything at an option of a driver's config that names a server or an account (its `url`, or a host, port, socket, user or password among the client options it passes on) is refused; map the variable instead, with `env: { url: \"<VARIABLE>\" }`.",
  effect: "project",
  input: z.object({ steps: z.array(STEP).min(1) }),
  async run({ steps }, sessionId) {
    const { literalTargetRefusal, raisedAccessRefusal } =
      await import("../../implementations/dms-builder/engine");
    const raised = raisedAccessRefusal(steps) ?? literalTargetRefusal(steps);
    if (raised !== undefined) return refusalResult("invalid_config", raised);
    const planned = await ConfigureProject(steps, { dryRun: true });
    if (!planned.ok) return opResult(planned);
    const plannedChanges = planned.changes.map(({ path, kind, diff }) => ({
      path,
      kind,
      diff,
    }));
    return repeatConfirmation.run(
      sessionId,
      "builder_configure_project",
      { steps, plannedChanges },
      async () => opResult(await ConfigureProject(steps)),
    );
  },
});

function unapprovedPagesRefusal(
  written: OpResult<MapResourcesResult>,
): McpToolResult | undefined {
  if (written.ok || written.error.code !== "invalid_config") return undefined;
  const issue = written.error.issues.find(({ message }) =>
    message.startsWith(UNAPPROVED_PAGES_PREFIX),
  );
  return issue === undefined ? undefined : textResult(issue.message, true);
}

const MAP_RESOURCES_INPUT = z.object({
  module: BOUND_MODULE,
  connection: CONNECTION,
  resources: z.array(MAPPED_RESOURCE),
  excluded: z
    .array(
      z.object({
        relation: z.string().describe("`schema.name`."),
        reason: z.string(),
      }),
    )
    .optional(),
});

type SentDisplay = z.infer<typeof MAPPED_FIELD>["display"];
type SentResource = z.infer<typeof MAPPED_RESOURCE>;

/**
 * A badge sent without its items, or a price without its currency, is the display the Builder
 * reads itself: left out.
 */
function displayInput(display: SentDisplay): ColumnDisplay | null | undefined {
  if (display === undefined || display === null) return display;
  if (display.kind === "price") {
    return display.currency === undefined ? undefined : display;
  }
  return display.items === undefined
    ? undefined
    : { kind: "badge", items: display.items };
}

function resourceInput(resource: SentResource): MappedResource {
  return {
    ...resource,
    fields: resource.fields.map(({ display, ...field }) => {
      const sent = displayInput(display);
      return sent === undefined ? field : { ...field, display: sent };
    }),
  };
}

function withReadBadges(
  sent: z.infer<typeof MAP_RESOURCES_INPUT>,
): MapResourcesInput {
  return { ...sent, resources: sent.resources.map(resourceInput) };
}

const mapResources = defineTool({
  name: "builder_map_resources",
  title: "Map resources",
  description:
    "Maps relations of a connected database into a project module bound to it (created with builder_configure_project): table classes and models with the database's names verbatim, DataAPI controllers and one TableView page per relation that has a key. Only your choices are sent: the Builder reads the relations' descriptions from its own catalog connection and checks every choice against them. A relation mapped before is rewritten from the new choices, its page created, kept or removed; a page you moved into a category with builder_configure_page is found by its table and updated where it is, never written again outside its category; a mapping that would remove a page asks the person first, listing it, and a denial writes nothing, and a page that appeared after the person approved is never removed: that write is refused, so call again to ask. `excluded` records relations decided against, so the next analysis does not propose them. A connection is read-only unless the dms-database entry of antelope.config.ts sets `config.externalConnections.<id>.access` to `read-write`: on a read-only one, a `writable: true` resource with a TableView is refused, and so are a ResourceForm that creates or edits its rows and a block over a table that still serves write routes. builder_set_connection_access changes it, once the person agrees. A relation the database account may not insert, update or delete in is mapped read-only even when asked `writable: true`, with a `relation_read_only` warning. Answers the files it wrote, without their diffs, and `leftOut`: columns a TableView cannot show, with why.",
  effect: "builder",
  input: MAP_RESOURCES_INPUT,
  async run(sent, sessionId) {
    const input = withReadBadges(sent);
    const preview = await PreviewMapResources(input);
    if (!preview.ok) return opResult(preview);
    const { pagesToRemove } = preview.data;
    const write = async () => {
      const written = await MapResources({
        ...input,
        approvedPageRemovals: pagesToRemove,
      });
      return (
        unapprovedPagesRefusal(written) ??
        redactedOpResult(written, (data) => data)
      );
    };
    return pagesToRemove.length === 0
      ? write()
      : repeatConfirmation.run(
          sessionId,
          "builder_map_resources",
          { ...sent, pagesToRemove },
          write,
        );
  },
});

const AnalyseDatabaseInputSchema = z.object({
  connection: z
    .string()
    .optional()
    .describe(
      "A connection id from database_connections, to start an analysis.",
    ),
  module: z
    .string()
    .optional()
    .describe(
      "The project module bound to the connection's database; relations it mapped or excluded are not proposed again.",
    ),
  schemas: z
    .array(z.string())
    .optional()
    .describe(
      "Limit the analysis to these schemas, as a `schemas` open item asks.",
    ),
  job: z
    .string()
    .optional()
    .describe("A running analysis's `id`, to read on instead of starting one."),
  detail: z
    .array(z.string())
    .optional()
    .describe(
      'Relations (`"schema.name"`) to answer in full, beside the compact list of them all: every choice with its rule, each column\'s profile and the open items of those relations.',
    ),
});

type AnalyseDatabaseArgs = z.infer<typeof AnalyseDatabaseInputSchema>;

async function startOrRead(
  args: AnalyseDatabaseArgs,
): Promise<OpResult<AnalysisState> | undefined> {
  if (args.job !== undefined) return GetAnalysis(args.job);
  if (args.connection === undefined || args.module === undefined) {
    return undefined;
  }
  return AnalyseDatabase({
    connection: args.connection,
    module: args.module,
    schemas: args.schemas,
  });
}

/**
 * What to pass instead of an incomplete call: the modules bound to the connection named, or every
 * catalog connection with the modules bound to each.
 */
async function missingInputRefusal(connection: string | undefined) {
  const { boundModuleIds, boundModulesSentence, listCatalogConnections } =
    await import("../../implementations/dms-builder/engine");
  const ask =
    "Pass `connection` and `module` to start an analysis, or `job` to read a running one.";
  if (connection !== undefined) {
    const bound = boundModulesSentence(connection);
    return refusalResult(
      "invalid_input",
      `${ask} ${bound.charAt(0).toUpperCase()}${bound.slice(1)}.`,
    );
  }
  const connections = listCatalogConnections().map((id) => {
    const bound = boundModuleIds(id);
    return `${id} (${bound.length === 0 ? "no module bound yet" : bound.join(", ")})`;
  });
  return refusalResult(
    "invalid_input",
    connections.length === 0
      ? `${ask} The project has no catalog connection yet.`
      : `${ask} The connections, with the modules bound to each: ${connections.join("; ")}.`,
  );
}

const analyseDatabase = defineTool({
  name: "builder_analyse_database",
  title: "Analyse database",
  description:
    "Runs the Builder's analysis of a connected database: it reads the catalog and the profiles and proposes a mapping by fixed rules, writing nothing. Answers the proposal compactly: per relation its title, screen (`table`, `status`, `tabs` or `stats`), rows when known, label column, columns with native type, relation, display and where each is used, and the columns left out; then the relations excluded and why, and `open`: what the rules could not decide, each with its option titles. A full proposal of a large database does not fit an agent's context, so name the relations you need in full in `detail`: it adds them in the shape builder_map_resources takes, each choice with its rule and `kind` (`fact` from the catalog, or `default`, a judgement to check), each column's `profile`, and their open items. It carries the database's shape, never a value from its rows: a field's `profile` holds traits, nulls, distinct and the rows of each category, a badge `{ kind: \"badge\", values }` says how many values it draws, and a price names no currency; builder_map_resources reads the values itself. Profiling is slow: when the analysis is still running after a minute this answers its progress and `job`; call again with that `job` to read on. A call without `job` answers the last finished proposal again, profiling nothing, while the module's mapping, the schemas and the database's catalog are unchanged. The answer's `access` is what the project lets the dashboard do on the connection now, `read` or `read-write`, and each resource's `writes` what the database account may insert, update and delete in it: on a `read` connection, propose no write action and map every resource `writable: false`.",
  effect: "read",
  input: AnalyseDatabaseInputSchema,
  async run(args) {
    let answer = await startOrRead(args);
    if (answer === undefined) return missingInputRefusal(args.connection);
    const deadline = Date.now() + ANALYSIS_WAIT_MS;
    while (
      answer.ok &&
      answer.data.status === "running" &&
      Date.now() < deadline
    ) {
      await delay(ANALYSIS_POLL_MS);
      answer = await GetAnalysis(answer.data.id);
    }
    return answerWithAccess(
      answer,
      answer.ok ? answer.data.connection : undefined,
      (state) => summariseAnalysis(redactAnalysis(state), args.detail),
    );
  },
});

const mapping = defineTool({
  name: "builder_mapping",
  title: "Builder mapping",
  description:
    "The relations a module maps for a connection, read back from its code as their current choices, in the proposal's shape (every rule `mapped`), with `included`: the columns the module declares. A badge shows how many values it draws, not the values, and a price no currency. Read it before mapping a relation again with builder_map_resources, so you send its current choices with only what you change. The answer's `access` is what the project lets the dashboard do on the connection now, `read` or `read-write`, and each resource's `writes` what the database account may insert, update and delete in it.",
  effect: "read",
  input: z.object({ connection: CONNECTION, module: BOUND_MODULE }),
  run: async ({ connection, module }) =>
    answerWithAccess(
      await GetMapping(connection, module),
      connection,
      (relations) => relations.map(redactMapping),
    ),
});

const setConnectionAccess = defineTool({
  name: "builder_set_connection_access",
  title: "Set connection access",
  description:
    "Changes what the dashboard may do on an external database: `read` shows its rows only, `read-write` lets the pages the builder maps add, edit and delete them. It writes `config.externalConnections.<connection>.access` on the dms-database entry of antelope.config.ts, as the Read & write switch of the Database module's Data browser does. Call it only after the person explicitly agreed in this conversation to let the dashboard change rows in their database, never on your own initiative: it changes what the dashboard can write to their database. `read-write` is refused while the database account may insert, update or delete rows in no table, or when its catalog does not answer. The first call writes nothing and answers the planned change: show it to the person, and repeat the same call to run it. Answers the files it wrote and `access`, what the project now lets the dashboard do on the connection; the running backend reads it after its restart, which `ajs project dev` starts on its own. Then map tables again with `writable: true`; a table the account may not write stays read-only.",
  effect: "project",
  input: z.object({
    connection: CONNECTION,
    access: z
      .enum(["read", "read-write"])
      .describe(
        "`read`, the default of every connection, or `read-write`, which the person chose.",
      ),
  }),
  async run({ connection, access }, sessionId) {
    const { connectionAccessSwitch } =
      await import("../../implementations/dms-builder/engine");
    const planned = await connectionAccessSwitch(connection, access);
    if (!planned.ok) return refusalResult(planned.code, planned.reason);
    const steps = [planned.step];
    const dryRun = await ConfigureProject(steps, { dryRun: true });
    if (!dryRun.ok) return opResult(dryRun);
    const write = async () =>
      answerWithAccess(
        await ConfigureProject(steps),
        connection,
        (data) => data,
      );
    if (dryRun.changes.length === 0) return write();
    const plannedChanges = dryRun.changes.map(({ path, kind, diff }) => ({
      path,
      kind,
      diff,
    }));
    return repeatConfirmation.run(
      sessionId,
      "builder_set_connection_access",
      { connection, access, plannedChanges },
      write,
    );
  },
});

export const BUILDER_PROJECT_TOOLS = [
  configureProject,
  mapResources,
  analyseDatabase,
  mapping,
  setConnectionAccess,
];
