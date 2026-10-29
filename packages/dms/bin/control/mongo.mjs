import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { freePort, isAlive, startDetached } from "./processes.mjs";

/** The server version the backend test harness pins, already cached by it. */
const MONGO_VERSION = "8.0.8";
const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

function withDefaultExports(namespace) {
  return { ...namespace.default, ...namespace };
}

/**
 * Imports a package the way the project under test resolves it: from the
 * playground first, then from this package.
 *
 * @param {string} name The package name
 * @param {string[]} from Folders to resolve from, in order
 * @returns {Promise<any>} The module namespace
 * @throws When no folder resolves it, saying which devDependency to add
 */
export async function importFrom(name, from) {
  for (const folder of from) {
    try {
      const resolved = createRequire(join(folder, "package.json")).resolve(
        name,
      );
      return withDefaultExports(await import(pathToFileURL(resolved).href));
    } catch {
      continue;
    }
  }
  throw new Error(
    `dms-control needs ${name}: add it to the playground's devDependencies.`,
  );
}

function mongodOnPath() {
  return spawnSync("mongod", ["--version"], { stdio: "ignore" }).status === 0
    ? "mongod"
    : undefined;
}

/**
 * The mongod binary: `DMS_CONTROL_MONGOD`, else `mongod` on PATH, else the
 * one mongodb-memory-server-core caches (and downloads once).
 *
 * @param {string[]} from Folders to resolve mongodb-memory-server-core from
 * @returns {Promise<string>} The binary path
 */
async function mongodBinary(from) {
  const configured = process.env.DMS_CONTROL_MONGOD ?? mongodOnPath();
  if (configured) return configured;
  const { MongoBinary } = await importFrom("mongodb-memory-server-core", from);
  return MongoBinary.getPath({ version: MONGO_VERSION });
}

async function waitForPort(port, record) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const { createConnection } = await import("node:net");
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (open) return;
    if (!isAlive(record.pid)) break;
    await sleep(POLL_MS);
  }
  throw new Error(`mongod did not listen on ${port}; see ${record.log}`);
}

/**
 * Starts a mongod owned by the run, on a free port, with its data under the
 * run folder.
 *
 * @param {{ mongo: string, logs: string }} paths The run's folders
 * @param {string[]} from Folders to resolve mongodb-memory-server-core from
 * @returns {Promise<{ url: string, record: ReturnType<typeof startDetached> }>} Its URL and process record
 */
export async function startMongod(paths, from) {
  const binary = await mongodBinary(from);
  const port = await freePort();
  mkdirSync(paths.mongo, { recursive: true });
  const record = startDetached({
    name: "mongod",
    program: binary,
    args: [
      "--dbpath",
      paths.mongo,
      "--port",
      String(port),
      "--bind_ip",
      "127.0.0.1",
    ],
    cwd: paths.mongo,
    env: process.env,
    logs: paths.logs,
  });
  await waitForPort(port, record);
  return { url: `mongodb://127.0.0.1:${port}`, record: { ...record, port } };
}

function driverBesideMemoryServer(from) {
  for (const folder of from) {
    try {
      const server = createRequire(join(folder, "package.json")).resolve(
        "mongodb-memory-server-core",
      );
      return createRequire(server).resolve("mongodb");
    } catch {
      continue;
    }
  }
  return undefined;
}

async function mongoDriver(from) {
  const beside = driverBesideMemoryServer(from);
  if (beside)
    return withDefaultExports(await import(pathToFileURL(beside).href));
  return importFrom("mongodb", from);
}

/**
 * Drops every database whose name starts with the run's prefix, through the
 * MongoDB driver that mongodb-memory-server-core depends on, or the
 * project's own.
 *
 * @param {string} url The server URL
 * @param {string} prefix The run's database prefix, `verify_<run id>`
 * @param {string[]} from Folders to resolve the driver from
 * @returns {Promise<string[]>} One line per dropped database
 */
export async function dropRunDatabases(url, prefix, from) {
  const { MongoClient } = await mongoDriver(from);
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const { databases } = await client.db("admin").admin().listDatabases();
    const owned = databases
      .map((database) => database.name)
      .filter((name) => name.startsWith(prefix));
    for (const name of owned) await client.db(name).dropDatabase();
    return owned.map((name) => `dropped database ${name}`);
  } finally {
    await client.close();
  }
}
