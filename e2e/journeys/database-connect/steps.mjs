import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fieldOf, itemsOf, parseJson, textOf, toolText } from "../../mcp-bridge.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
export const RESTART_TIMEOUT_MS = 240_000;
export const POLL_MS = 2_000;
const SETTLE_MS = 5_000;

/**
 * @param {import("../../mcp-bridge.mjs").Session} session
 * @param {string} name The tool
 * @param {Record<string, unknown>} [args] Its arguments
 * @returns {Promise<{ ok: boolean, data: unknown, raw: string }>} Whether it succeeded, and what it answered
 */
export async function operation(session, name, args = {}) {
  const answer = toolText(await session.call(name, args));
  const body = parseJson(answer.text);
  return { ok: !answer.isError && fieldOf(body, "ok") === true, data: fieldOf(body, "data"), raw: answer.text };
}

/**
 * The `@antelopejs/mongodb` version the playground's `mongodb` module pins in its `antelope.config.ts`.
 *
 * @param {string} root The playground
 * @returns {string} The version
 */
export function playgroundMongodbVersion(root) {
  const pinned = /package: "@antelopejs\/mongodb",\s*version: "([^"]+)"/.exec(readFileSync(join(root, "antelope.config.ts"), "utf8"));
  if (!pinned?.[1]) throw new Error(`${root}/antelope.config.ts pins no @antelopejs/mongodb version`);
  return pinned[1];
}

/**
 * The batch the Builder's *Connect a database* form writes for a MongoDB database, from what `database_project` answers.
 * The driver module installs the version the playground's own `mongodb` module runs, so the journey loads no driver release the playground does not.
 *
 * @param {string} id The connection id
 * @param {unknown} project What `database_project` answered
 * @param {string} root The playground
 * @returns {Record<string, unknown>[]} Its steps
 */
export function connectSteps(id, project, root) {
  const driver = fieldOf(fieldOf(project, "drivers"), "mongodb");
  const driverModule = `builder-db-${id}`;
  const tablesModule = `${driverModule}-tables`;
  const variable = driverModule.toUpperCase().replace(/-/g, "_");
  return [
    {
      op: "AddModule",
      id: driverModule,
      entry: {
        source: { type: "package", package: textOf(fieldOf(driver, "package")), version: playgroundMongodbVersion(root) },
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
export async function seedOrders(ctx, database) {
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
 * @param {import("../../mcp-bridge.mjs").Session} session
 * @returns {Promise<boolean>} Whether `database_project` answers ok again in time
 */
export async function untilAnswering(session) {
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
export function backendLog(ctx) {
  const folder = ctx.state.logs;
  return readdirSync(folder)
    .filter((name) => name.startsWith("backend"))
    .map((name) => readFileSync(join(folder, name), "utf8"))
    .join("\n");
}

