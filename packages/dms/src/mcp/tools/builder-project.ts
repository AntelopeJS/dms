import { ConfigureProject } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { JsonObjectSchema } from "../json";
import { repeatConfirmation } from "../confirmation-gate";
import { defineTool } from "../tool";
import { opResult, refusalResult } from "./builder-shared";
import { answerWithAccess, CONNECTION } from "./builder-connection-access";
import { mapResources } from "./builder-map-resources";
import { analyseDatabase, mapping } from "./builder-analysis";

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
