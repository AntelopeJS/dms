import { randomBytes } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
const RESTART_TIMEOUT_MS = 240_000;
const POLL_MS = 2_000;
const SETTLE_MS = 5_000;

/**
 * @param {import("../mcp-bridge.mjs").Session} session
 * @param {string} name The tool
 * @param {Record<string, unknown>} [args] Its arguments
 * @returns {Promise<{ ok: boolean, data: unknown, raw: string }>} Whether it succeeded, and what it answered
 */
async function operation(session, name, args = {}) {
  const answer = toolText(await session.call(name, args));
  const body = parseJson(answer.text);
  return { ok: !answer.isError && fieldOf(body, "ok") === true, data: fieldOf(body, "data"), raw: answer.text };
}

/**
 * The batch the Builder's *Connect a database* form writes for a MongoDB database, from what `database_project` answers.
 *
 * @param {string} id The connection id
 * @param {unknown} project What `database_project` answered
 * @returns {Record<string, unknown>[]} Its steps
 */
function connectSteps(id, project) {
  const driver = fieldOf(fieldOf(project, "drivers"), "mongodb");
  const driverModule = `builder-db-${id}`;
  const tablesModule = `${driverModule}-tables`;
  const variable = driverModule.toUpperCase().replace(/-/g, "_");
  return [
    {
      op: "AddModule",
      id: driverModule,
      entry: {
        source: { type: "package", package: textOf(fieldOf(driver, "package")), version: textOf(fieldOf(driver, "version")) },
        config: { mode: "external", statementTimeoutMs: 30_000 },
        env: { url: `${variable}_URL`, database: `${variable}_DATABASE` },
        exportPriority: { [DATABASE]: -1 },
        disabledExports: ["@antelopejs/interface-mongodb"],
      },
    },
    {
      op: "CreateLocalModule",
      id: tablesModule,
      path: `modules/${tablesModule}`,
      entry: { importOverrides: [{ interface: DATABASE, source: driverModule }] },
      connection: id,
    },
    { op: "ConfigureModule", id: textOf(fieldOf(project, "self")), entry: { importOverrides: [{ interface: CATALOG, source: driverModule, id }] } },
    ...itemsOf(fieldOf(project, "databasePins")).map((pin) => ({
      op: "ConfigureModule",
      id: textOf(fieldOf(pin, "module")),
      entry: { importOverrides: [{ interface: DATABASE, source: textOf(fieldOf(pin, "provider")) }] },
    })),
  ];
}

/**
 * Writes the `orders` collection the analysis reads into the database the connection names.
 *
 * @param {Ctx} ctx
 * @param {string} database The connected database
 * @returns {Promise<void>} Resolves once written
 */
async function seedOrders(ctx, database) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(ctx.state.mongoUrl);
  try {
    await client.db(database).collection("orders").insertMany([
      { status: "paid", amount: 420 },
      { status: "refunded", amount: 55 },
      { status: "pending", amount: 110 },
    ]);
  } finally {
    await client.close();
  }
}

/**
 * Waits out the restart a write to `.env` triggers, as the popup's single write does not need to.
 *
 * @param {import("../mcp-bridge.mjs").Session} session
 * @returns {Promise<boolean>} Whether `database_project` answers ok again in time
 */
async function untilAnswering(session) {
  await sleep(SETTLE_MS);
  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const answer = await session
      .followRestart()
      .then(() => operation(session, "database_project"))
      .catch(() => ({ ok: false }));
    if (answer.ok) return true;
    await sleep(POLL_MS);
  }
  return false;
}

/**
 * @param {Ctx} ctx
 * @returns {string} What the run's backend logs wrote, the newest last
 */
function backendLog(ctx) {
  const folder = ctx.state.logs;
  return readdirSync(folder)
    .filter((name) => name.startsWith("backend"))
    .map((name) => readFileSync(join(folder, name), "utf8"))
    .join("\n");
}

/** A database connected through the Builder, as its *Connect a database* form does. */
export const journeys = [
  {
    id: "database-connect-restarts-under-watch",
    title: "under ajs project dev -w, the connect batch restarts the project with its tables module installed, and the connection answers",
    entryPoint: "MCP tools database_project, builder_configure_project, database_connections",
    backend: "watch",
    standby: false,
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
];
