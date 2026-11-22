import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fieldOf, textOf, toolText, withBridge } from "../mcp-bridge.mjs";
import { journeys as correctUrlJourneys } from "./database-connect/correct-url.mjs";
import { RESTART_TIMEOUT_MS, POLL_MS, backendLog, connectSteps, operation, seedOrders, untilAnswering } from "./database-connect/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

/** A database connected through the Builder, as its *Connect a database* form does. They open no tab, so `e2e/integration/journeys.test.mjs` runs them. */
export const journeys = [];

/** The command-line journeys of the feature. */
export const commandLineJourneys = [
  {
    id: "database-connect-restarts-under-watch",
    title: "under ajs project dev -w, the connect batch restarts the project with its tables module installed, and the connection answers",
    entryPoint: "MCP tools database_project, builder_configure_project, database_connections",
    backend: "watch",
    standby: false,
    last: true,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const id = `shop${randomBytes(3).toString("hex")}`;
        const project = await operation(session, "database_project");
        await ctx.verify("database_project names a MongoDB driver", [
          ctx.holds("a driver package", textOf(fieldOf(fieldOf(fieldOf(project.data, "drivers"), "mongodb"), "package")) !== "", project.raw.slice(0, 400)),
        ], { critical: true });
        const database = `${ctx.state.database}_${id}`;
        await seedOrders(ctx, database);
        const root = ctx.state.runPlayground ?? ctx.state.playground;
        const variable = `BUILDER_DB_${id.toUpperCase()}`;
        appendFileSync(join(root, ".env"), `\n${variable}_URL=${ctx.state.mongoUrl}\n${variable}_DATABASE=${database}\n`);
        await ctx.verify("the project answers again after the variables are written", [
          ctx.holds("database_project answers", await untilAnswering(session), "no answer"),
        ], { critical: true });
        const steps = connectSteps(id, project.data);
        const tablesModule = `builder-db-${id}-tables`;
        await operation(session, "builder_configure_project", { steps });
        const written = await operation(session, "builder_configure_project", { steps });
        await ctx.verify("the batch is written", [ctx.holds("ConfigureProject answers ok", written.ok, written.raw.slice(0, 600))], { critical: true });
        const deadline = Date.now() + RESTART_TIMEOUT_MS;
        let listed = "";
        while (Date.now() < deadline) {
          await sleep(POLL_MS);
          listed = await session
            .followRestart()
            .then(() => session.call("database_connections"))
            .then((answer) => toolText(answer).text, (/** @type {unknown} */ error) => String(error));
          if (listed.includes(`"${id}"`) && !listed.includes("error")) break;
        }
        const log = backendLog(ctx);
        await ctx.verify("the restart loads the connection", [
          ctx.holds("core installed the tables module", !log.includes(`Install failed for ${tablesModule}`), log.split("\n").filter((line) => line.includes(tablesModule) || line.includes("ExecError")).slice(-6).join("\n")),
          ctx.holds("database_connections lists it", listed.includes(`"${id}"`), listed.slice(0, 600)),
        ], { critical: true });
        const analysis = await operation(session, "builder_analyse_database", { connection: id, module: tablesModule });
        await ctx.verify("the analysis starts with no manual restart", [
          ctx.holds("builder_analyse_database answers ok", analysis.ok, analysis.raw.slice(0, 600)),
          ctx.holds("it reads the orders collection", analysis.raw.includes("orders"), analysis.raw.slice(0, 600)),
        ]);
      });
    },
  },
  ...correctUrlJourneys,
];
