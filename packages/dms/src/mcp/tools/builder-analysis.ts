import { setTimeout as delay } from "node:timers/promises";
import {
  AnalyseDatabase,
  type AnalysisState,
  GetAnalysis,
  GetMapping,
  type OpResult,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { defineTool } from "../tool";
import { summariseAnalysis } from "../analysis-summary";
import { redactAnalysis, redactMapping } from "../redact";
import { refusalResult } from "./builder-shared";
import {
  answerWithAccess,
  BOUND_MODULE,
  CONNECTION,
} from "./builder-connection-access";

const ANALYSIS_WAIT_MS = 60_000;
const ANALYSIS_POLL_MS = 1_000;

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

export const analyseDatabase = defineTool({
  name: "builder_analyse_database",
  title: "Analyse database",
  description:
    "Runs the Builder's analysis of a connected database: it reads the catalog and the profiles and proposes a mapping by fixed rules, writing nothing. Answers the proposal compactly: per relation its title, screen (`table`, `status`, `tabs` or `stats`), rows when known, label column, columns with native type, relation, display and where each is used, and the columns left out; then the relations excluded and why, `open`: what the rules could not decide, each with its option titles, and `mapped`: the relations read that the module maps already, which it leaves out. A full proposal of a large database does not fit an agent's context, so name the relations you need in full in `detail`: it adds them in the shape builder_map_resources takes, each choice with its rule and `kind` (`fact` from the catalog, or `default`, a judgement to check), each column's `profile`, and their open items. It carries the database's shape, never a value from its rows: a field's `profile` holds traits, nulls, distinct and the rows of each category, a badge `{ kind: \"badge\", values }` says how many values it draws, and a price names no currency; builder_map_resources reads the values itself. Profiling is slow: when the analysis is still running after a minute this answers its progress and `job`; call again with that `job` to read on. A call without `job` answers the last finished proposal again, profiling nothing, while the module's mapping, the schemas and the database's catalog are unchanged. The answer's `access` is what the project lets the dashboard do on the connection now, `read` or `read-write`, and each resource's `writes` what the database account may insert, update and delete in it: on a `read` connection, propose no write action and map every resource `writable: false`.",
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

export const mapping = defineTool({
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
