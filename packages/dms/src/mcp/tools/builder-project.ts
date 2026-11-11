import { setTimeout as delay } from "node:timers/promises";
import {
  AnalyseDatabase,
  type AnalysisState,
  ConfigureProject,
  GetAnalysis,
  GetMapping,
  MapResources,
  type MapResourcesResult,
  type OpResult,
  PreviewMapResources,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool, type McpToolResult, textResult } from "../tool";
import { opResult, refusalResult } from "./builder-shared";
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
        items: z.array(
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
        ),
      }),
      z.object({
        kind: z.literal("price"),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional()
          .describe(
            "ISO 4217 code of the amount (`USD`). Left out, the Builder reads it from the column comment or a one-value currency column, else amounts show in euros.",
          ),
      }),
    ])
    .nullable()
    .optional()
    .describe(
      "How the column is drawn: a `badge` on a text column of few values, a `price` on an amount. The proposal's display when left out; `null` writes the column plain.",
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
    .describe("The page's title; the relation's name, humanized, by default."),
  tableView: z
    .boolean()
    .describe("False for a stats-only relation; forced false without a key."),
  writable: z
    .boolean()
    .describe("False serves the TableView without new, edit and delete."),
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

const configureProject = defineTool({
  name: "builder_configure_project",
  title: "Configure project",
  description:
    "Edits antelope.config.ts in one step: adds modules (AddModule), merges into existing ones (ConfigureModule: config, importOverrides pins and connections, exportPriority, env variable names) and scaffolds local modules (CreateLocalModule). Every step is validated before anything is written, and a refused step writes nothing. The user always approves the change, shown as a diff. A restart is needed before new modules load.",
  effect: "project",
  input: z.object({ steps: z.array(STEP).min(1) }),
  async run({ steps }) {
    const planned = await ConfigureProject(steps, { dryRun: true });
    if (!planned.ok) return opResult(planned);
    const plannedChanges = planned.changes.map(({ path, kind, diff }) => ({
      path,
      kind,
      diff,
    }));
    return (
      repeatConfirmation.hold("builder_configure_project", {
        steps,
        plannedChanges,
      }) ?? opResult(await ConfigureProject(steps))
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

const mapResources = defineTool({
  name: "builder_map_resources",
  title: "Map resources",
  description:
    "Maps relations of a connected database into a project module bound to it (created with builder_configure_project): table classes and models with the database's names verbatim, DataAPI controllers and one TableView page per relation that has a key. Only your choices are sent: the Builder reads the relations' descriptions from its own catalog connection and checks every choice against them. A relation mapped before is rewritten from the new choices, its page created, kept or removed; a mapping that would remove a page asks the person first, listing it, and a denial writes nothing, and a page that appeared after the person approved is never removed: that write is refused, so call again to ask. `excluded` records relations decided against, so the next analysis does not propose them. Answers what was written and `leftOut`: columns a TableView cannot show, with why.",
  effect: "builder",
  input: z.object({
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
  }),
  async run(input) {
    const preview = await PreviewMapResources(input);
    if (!preview.ok) return opResult(preview);
    const { pagesToRemove } = preview.data;
    const held =
      pagesToRemove.length === 0
        ? undefined
        : repeatConfirmation.hold("builder_map_resources", {
            ...input,
            pagesToRemove,
          });
    if (held !== undefined) return held;
    const written = await MapResources({
      ...input,
      approvedPageRemovals: pagesToRemove,
    });
    return unapprovedPagesRefusal(written) ?? opResult(written);
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

const analyseDatabase = defineTool({
  name: "builder_analyse_database",
  title: "Analyse database",
  description:
    "Runs the Builder's analysis of a connected database: it reads the catalog and the profiles and proposes a mapping by fixed rules, writing nothing. Answers the proposal: resources in the shape builder_map_resources takes, each choice with its rule and `kind` (`fact` from the catalog, or `default`, a judgement to check), the relations excluded and why, and `open`: what the rules could not decide, each with its options. Profiling is slow: when the analysis is still running after a minute this answers its progress and `job`; call again with that `job` to read on.",
  effect: "read",
  input: AnalyseDatabaseInputSchema,
  async run(args) {
    let answer = await startOrRead(args);
    if (answer === undefined) {
      return refusalResult(
        "invalid_input",
        "Pass `connection` and `module` to start an analysis, or `job` to read a running one.",
      );
    }
    const deadline = Date.now() + ANALYSIS_WAIT_MS;
    while (
      answer.ok &&
      answer.data.status === "running" &&
      Date.now() < deadline
    ) {
      await delay(ANALYSIS_POLL_MS);
      answer = await GetAnalysis(answer.data.id);
    }
    return opResult(answer);
  },
});

const mapping = defineTool({
  name: "builder_mapping",
  title: "Builder mapping",
  description:
    "The relations a module maps for a connection, read back from its code as their current choices, in the proposal's shape (every rule `mapped`), with `included`: the columns the module declares. Read it before mapping a relation again with builder_map_resources, so you send its current choices with only what you change.",
  effect: "read",
  input: z.object({ connection: CONNECTION, module: BOUND_MODULE }),
  run: async ({ connection, module }) =>
    opResult(await GetMapping(connection, module)),
});

export const BUILDER_PROJECT_TOOLS = [
  configureProject,
  mapResources,
  analyseDatabase,
  mapping,
];
