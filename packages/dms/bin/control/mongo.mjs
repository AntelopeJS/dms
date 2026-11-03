import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { arrayOf, decode, isRecord, isString, objectOf } from "./json.mjs";
import { freePort, startDetached, waitForPort } from "./processes.mjs";

/**
 * @typedef {(...args: unknown[]) => unknown} Callable A function whose result is read as `unknown`
 * @typedef {new (...args: unknown[]) => unknown} Constructor A class whose instances are read as `unknown`
 * @typedef {{ connect: Callable, close: Callable, db: Callable }} Client The calls made on a driver client
 * @typedef {{ admin: Callable, dropDatabase: Callable }} Database The calls made on a driver database
 * @typedef {{ listDatabases: Callable }} Admin The call made on a driver's admin handle
 */

/** The server version the backend test harness pins, already cached by it. */
const MONGO_VERSION = "8.0.8";
const READY_TIMEOUT_MS = 30_000;

/**
 * @param {unknown} value
 * @returns {value is object} True for an object or a function, which can hold members
 */
function isObjectLike(value) {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

/**
 * @param {unknown} value
 * @returns {value is Callable} True for a function
 */
function isCallable(value) {
  return typeof value === "function";
}

/**
 * @param {unknown} value
 * @returns {value is Constructor} True for a function, which `new` can call
 */
function isConstructor(value) {
  return typeof value === "function";
}

/**
 * @param {unknown} value
 * @returns {value is { getPath: Callable }} True for an object with a `getPath` function
 */
function isBinaryResolver(value) {
  return isObjectLike(value) && "getPath" in value && isCallable(value.getPath);
}

/**
 * @param {unknown} value
 * @returns {value is Client} True for an object with `connect`, `close` and `db` functions
 */
function isClient(value) {
  return (
    isObjectLike(value) &&
    "connect" in value &&
    isCallable(value.connect) &&
    "close" in value &&
    isCallable(value.close) &&
    "db" in value &&
    isCallable(value.db)
  );
}

/**
 * @param {unknown} value
 * @returns {value is Database} True for an object with `admin` and `dropDatabase` functions
 */
function isDatabase(value) {
  return (
    isObjectLike(value) &&
    "admin" in value &&
    isCallable(value.admin) &&
    "dropDatabase" in value &&
    isCallable(value.dropDatabase)
  );
}

/**
 * @param {unknown} value
 * @returns {value is Admin} True for an object with a `listDatabases` function
 */
function isAdmin(value) {
  return (
    isObjectLike(value) &&
    "listDatabases" in value &&
    isCallable(value.listDatabases)
  );
}

const isDatabaseList = objectOf({
  databases: arrayOf(objectOf({ name: isString })),
});

/**
 * @param {unknown} namespace A module namespace
 * @returns {Record<string, unknown>} Its exports, with those of a CommonJS `default` added
 */
function withDefaultExports(namespace) {
  if (!isRecord(namespace))
    throw new TypeError("A module namespace is not an object");
  const fallback = namespace.default;
  const exports = isObjectLike(fallback) ? fallback : {};
  return { ...exports, ...namespace };
}

/**
 * Imports a package the way the project under test resolves it: from the
 * playground first, then from this package.
 *
 * @param {string} name The package name
 * @param {string[]} from Folders to resolve from, in order
 * @returns {Promise<Record<string, unknown>>} The module namespace
 * @throws When no folder resolves it, saying which devDependency to add
 */
async function importNamespace(name, from) {
  for (const folder of from) {
    try {
      const resolved = createRequire(join(folder, "package.json")).resolve(
        name,
      );
      /** @type {unknown} */
      const namespace = await import(pathToFileURL(resolved).href);
      return withDefaultExports(namespace);
    } catch {
      continue;
    }
  }
  throw new Error(
    `dms-control needs ${name}: add it to the playground's devDependencies.`,
  );
}

/**
 * A package's namespace, for the one caller whose use of it cannot be checked
 * at the import: it launches Playwright's browser and drives it through
 * Playwright's own declarations.
 *
 * @param {string} name The package name
 * @param {string[]} from Folders to resolve from, in order
 * @returns {Promise<any>} The module namespace
 * @throws When no folder resolves it, saying which devDependency to add
 */
export async function importFrom(name, from) {
  return importNamespace(name, from);
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
export async function mongodBinary(from) {
  const configured = process.env.DMS_CONTROL_MONGOD ?? mongodOnPath();
  if (configured) return configured;
  const namespace = await importNamespace("mongodb-memory-server-core", from);
  const binary = namespace.MongoBinary;
  if (!isBinaryResolver(binary))
    throw new TypeError("mongodb-memory-server-core exports no MongoBinary");
  /** @type {unknown} */
  const path = await binary.getPath({ version: MONGO_VERSION });
  return decode(
    isString,
    path,
    "MongoBinary.getPath",
    "the path of a mongod binary",
  );
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
  await waitForPort(port, record, READY_TIMEOUT_MS);
  return { url: `mongodb://127.0.0.1:${port}`, record: { ...record, port } };
}

/**
 * @param {string[]} from
 * @returns {string | undefined}
 */
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

/**
 * @param {string[]} from
 * @returns {Promise<Record<string, unknown>>}
 */
async function mongoDriver(from) {
  const beside = driverBesideMemoryServer(from);
  if (beside)
    return withDefaultExports(await import(pathToFileURL(beside).href));
  return importNamespace("mongodb", from);
}

/**
 * @param {Client} client A driver client
 * @param {string} name The database
 * @returns {Database} Its handle
 * @throws When the driver answers anything but a database
 */
function databaseOf(client, name) {
  /** @type {unknown} */
  const database = client.db(name);
  if (!isDatabase(database))
    throw new TypeError(`MongoClient.db(${name}) returned no database`);
  return database;
}

/**
 * Runs `use` on a client connected to the server, then closes it.
 *
 * @template T
 * @param {string} url The server URL
 * @param {string[]} from Folders to resolve the driver from
 * @param {(client: Client) => Promise<T>} use What to do with the connected client
 * @returns {Promise<T>} What `use` answered
 * @throws When the driver exports no `MongoClient` that builds a client
 */
async function withClient(url, from, use) {
  const namespace = await mongoDriver(from);
  const MongoClient = namespace.MongoClient;
  if (!isConstructor(MongoClient))
    throw new TypeError("The MongoDB driver exports no MongoClient");
  /** @type {unknown} */
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5_000 });
  if (!isClient(client))
    throw new TypeError("MongoClient built something that is no client");
  try {
    await client.connect();
    return await use(client);
  } finally {
    await client.close();
  }
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
export function dropRunDatabases(url, prefix, from) {
  return withClient(url, from, async (client) => {
    const admin = databaseOf(client, "admin").admin();
    if (!isAdmin(admin))
      throw new TypeError(
        "The admin handle of the driver has no listDatabases",
      );
    const { databases } = decode(
      isDatabaseList,
      await admin.listDatabases(),
      "listDatabases",
      "a list of databases",
    );
    const owned = databases
      .map((database) => database.name)
      .filter((name) => name.startsWith(prefix));
    for (const name of owned) await databaseOf(client, name).dropDatabase();
    return owned.map((name) => `dropped database ${name}`);
  });
}

/**
 * Drops one database of the run.
 *
 * @param {string} url The server URL
 * @param {string} name The database
 * @param {string[]} from Folders to resolve the driver from
 * @returns {Promise<void>} Resolves once dropped
 */
export function dropDatabase(url, name, from) {
  return withClient(url, from, async (client) => {
    await databaseOf(client, name).dropDatabase();
  });
}
