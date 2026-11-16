import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fieldOf, itemsOf, parseJson, toolText, withBridge } from "../../mcp-bridge.mjs";
import { POLL_MS, RESTART_TIMEOUT_MS, connectSteps, operation, seedOrders, untilAnswering } from "./steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const READ_HEAD_START_MS = 100;

/**
 * @param {string} url The run's MongoDB URL
 * @param {string} appName What the driver tells the server it is
 * @returns {string} The same server, with a client name the server's log records
 */
function tagged(url, appName) {
  const result = new URL(url);
  result.searchParams.set("appName", appName);
  return result.href;
}

/**
 * @param {Ctx} ctx
 * @param {string} appName A client name written into a URL
 * @returns {boolean} Whether the run's MongoDB server logged a client that connected under it
 */
function connectedAs(ctx, appName) {
  return readFileSync(join(ctx.state.logs, "mongod.log"), "utf8").includes(`"application":{"name":"${appName}"}`);
}

/**
 * @param {Ctx} ctx
 * @param {string} appName
 * @returns {Promise<boolean>} Whether the server logged such a client within the restart timeout
 */
async function untilConnectedAs(ctx, appName) {
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (connectedAs(ctx, appName)) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * Polls `database_connections` until `done` accepts the entry of the connection.
 *
 * @param {import("../../mcp-bridge.mjs").Session} session
 * @param {string} id The connection
 * @param {(entry: unknown) => boolean} done Whether the entry reads as expected
 * @returns {Promise<{ entry: unknown, raw: string }>} The last entry read, and the whole answer
 */
async function connectionEntry(session, id, done) {
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  let entry;
  let raw = "";
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    raw = await session
      .followRestart()
      .then(() => session.call("database_connections"))
      .then((answer) => toolText(answer).text, (/** @type {unknown} */ error) => String(error));
    entry = itemsOf(parseJson(raw)).find((item) => fieldOf(item, "connection") === id);
    if (entry !== undefined && done(entry)) break;
  }
  return { entry, raw };
}

/** @param {unknown} entry A `database_connections` entry */
function answers(entry) {
  return fieldOf(entry, "error") === undefined;
}

/** A connection whose URL is corrected in `.env`, as `SetDatabaseConnectionUrl` writes it, before the restart. */
export const journeys = [
  {
    id: "database-connect-corrects-a-url",
    title: "under ajs project dev -w, a connection whose URL is corrected in .env connects on the corrected URL after the restart, though a builder call that loads the configuration ran in between",
    entryPoint: "MCP tools database_project, builder_configure_project, builder_map_resources, database_connections",
    backend: "watch",
    standby: false,
    last: true,
    async run(/** @type {Ctx} */ ctx) {
      await withBridge(ctx, async (session) => {
        const id = `shop${randomBytes(3).toString("hex")}`;
        const project = await operation(session, "database_project");
        const database = `${ctx.state.database}_${id}`;
        await seedOrders(ctx, database);
        const variable = `BUILDER_DB_${id.toUpperCase()}`;
        const root = ctx.state.runPlayground ?? ctx.state.playground;
        const envFile = join(root, ".env");
        const first = `first-${id}`;
        const corrected = `corrected-${id}`;
        appendFileSync(envFile, `\n${variable}_URL=${tagged(ctx.state.mongoUrl, first)}\n${variable}_DATABASE=${database}\n`);
        await ctx.verify("the project answers again after the variables are written", [
          ctx.holds("database_project answers", await untilAnswering(session), "no answer"),
        ], { critical: true });
        const steps = connectSteps(id, project.data);
        await operation(session, "builder_configure_project", { steps });
        const written = await operation(session, "builder_configure_project", { steps });
        await ctx.verify("the batch is written", [ctx.holds("ConfigureProject answers ok", written.ok, written.raw.slice(0, 600))], { critical: true });
        const listed = await connectionEntry(session, id, answers);
        await ctx.verify("the restart connects on the first URL", [
          ctx.holds("database_connections lists the connection without an error", listed.entry !== undefined && answers(listed.entry), listed.raw.slice(0, 600)),
          ctx.holds("the MongoDB server logged a client named by the first URL", await untilConnectedAs(ctx, first), first),
        ], { critical: true });

        const tablesModule = `builder-db-${id}-tables`;
        const reading = operation(session, "builder_map_resources", { module: tablesModule, connection: id, resources: [] });
        await sleep(READ_HEAD_START_MS);
        writeFileSync(envFile, readFileSync(envFile, "utf8").replace(new RegExp(`^${variable}_URL=.*$`, "m"), `${variable}_URL=${tagged(ctx.state.mongoUrl, corrected)}`));
        const read = await reading;
        await ctx.verify("the corrected URL is in .env and a builder call that loads the configuration ran before the restart", [
          ctx.holds(".env holds the corrected URL", readFileSync(envFile, "utf8").includes(`appName=${corrected}`), envFile),
          ctx.holds("builder_map_resources answered", read.raw !== "", read.raw.slice(0, 400)),
        ], { critical: true });

        const after = await connectionEntry(session, id, answers);
        await ctx.verify("after the restart the connection answers on the corrected URL", [
          ctx.holds("database_connections lists it without an error", after.entry !== undefined && answers(after.entry), after.raw.slice(0, 600)),
          ctx.holds("the MongoDB server logged a client named by the corrected URL", await untilConnectedAs(ctx, corrected), corrected),
        ], { critical: true });
        const analysis = await operation(session, "builder_analyse_database", { connection: id, module: tablesModule });
        await ctx.verify("the analysis reads the corrected database", [
          ctx.holds("builder_analyse_database answers ok", analysis.ok, analysis.raw.slice(0, 600)),
          ctx.holds("it reads the orders collection", analysis.raw.includes("orders"), analysis.raw.slice(0, 600)),
        ]);
      });
    },
  },
];
