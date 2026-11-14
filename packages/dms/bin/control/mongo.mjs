import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  arrayOf,
  decode,
  isBoolean,
  isRecord,
  isString,
  objectOf,
  recordOf,
} from "./json.mjs";
import {
  freePort,
  startDetached,
  stopRecorded,
  waitForOwnPort,
} from "./processes.mjs";

/** A file name Node runs as a script. */
const JAVASCRIPT_FILE = /\.[cm]?js$/u;

/**
 * @typedef {(...args: unknown[]) => unknown} Callable A function whose result is read as `unknown`
 * @typedef {new (...args: unknown[]) => unknown} Constructor A class whose instances are read as `unknown`
 * @typedef {{ connect: Callable, close: Callable, db: Callable }} Client The calls made on a driver client
 * @typedef {{ admin: Callable, dropDatabase: Callable }} Database The calls made on a driver database
 * @typedef {{ listDatabases: Callable }} Admin The call made on a driver's admin handle
 * @typedef {{ command: Callable }} Commander The call that runs a server command on a driver's admin handle
 */

/** The server version the backend test harness pins, already cached by it. */
const MONGO_VERSION = "8.0.8";
const READY_TIMEOUT_MS = 30_000;
const PRIMARY_POLL_MS = 100;

/** The code mongod answers `replSetInitiate` with when its data folder already holds the set, as on a restart. */
const ALREADY_INITIALIZED = 23;

/** The single-node replica set the run's mongod serves, so change streams work on it. */
const REPLICA_SET = "dms-control";

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
 * @returns {value is Constructor} True for a function that `new` accepts, such as a class or a bound class, and false for an arrow function or a method
 */
function isConstructor(value) {
  if (!isCallable(value)) return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
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

/**
 * @param {unknown} value
 * @returns {value is Commander} True for an object with a `command` function
 */
function isCommander(value) {
  return isObjectLike(value) && "command" in value && isCallable(value.command);
}

const isDatabaseList = objectOf({
  databases: arrayOf(objectOf({ name: isString })),
});

const isHello = objectOf({ isWritablePrimary: isBoolean });

/**
 * @param {unknown} error
 * @returns {boolean} True for the answer of a mongod whose replica set is already initiated
 */
function isAlreadyInitialized(error) {
  return (
    isObjectLike(error) && "code" in error && error.code === ALREADY_INITIALIZED
  );
}

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
 * @throws When no folder resolves it, saying how to install it
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
  throw new Error(missingPackage(name));
}

/**
 * What to do about a package no folder resolves. A package that
 * `@antelopejs/dms` declares optional was skipped by the install, so the
 * message names the command that adds it at the declared range.
 *
 * @param {string} name The package name
 * @returns {string} The error message
 */
function missingPackage(name) {
  const { optionalDependencies } = decode(
    objectOf({ optionalDependencies: recordOf(isString) }),
    createRequire(import.meta.url)("../../package.json"),
    "@antelopejs/dms package.json",
    "optionalDependencies of version ranges",
  );
  if (!Object.hasOwn(optionalDependencies, name))
    return `dms-control needs ${name}: add it to the playground's devDependencies.`;
  const spec = `${name}@${optionalDependencies[name]}`;
  return `dms-control needs ${name}, an optional dependency of @antelopejs/dms that this install skipped: run \`npm install --save-dev ${spec}\` (or \`pnpm add --save-dev ${spec}\`) in the module that runs dms-control.`;
}

/**
 * A package's namespace, for the one caller whose use of it cannot be checked
 * at the import: it launches Playwright's browser and drives it through
 * Playwright's own declarations.
 *
 * @param {string} name The package name
 * @param {string[]} from Folders to resolve from, in order
 * @returns {Promise<any>} The module namespace
 * @throws When no folder resolves it, saying how to install it
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
 * one mongodb-memory-server-core caches (and downloads once). A
 * `DMS_CONTROL_MONGOD` that names a JavaScript file, such as a stand-in,
 * runs on this Node (see {@link startMongod}).
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
 * Starts a mongod owned by the run, on `port` or a free one, with its data
 * under the run folder, as the only member of a replica set, so change
 * streams work. A mongod that does not become primary is stopped before the
 * error is thrown. A binary that is a JavaScript file runs on this Node, as
 * every other process dms-control starts does, since Windows runs no script
 * by its path alone.
 *
 * @param {{ mongo: string, logs: string }} paths The run's folders
 * @param {string[]} from Folders to resolve mongodb-memory-server-core from
 * @param {number} [port] The port, which a restart keeps so the backend's URL still reaches it
 * @returns {Promise<{ url: string, record: ReturnType<typeof startDetached> & { port: number } }>} Its URL and process record
 */
export async function startMongod(paths, from, port) {
  const binary = await mongodBinary(from);
  port ??= await freePort();
  mkdirSync(paths.mongo, { recursive: true });
  const script = JAVASCRIPT_FILE.test(binary);
  const record = startDetached({
    name: "mongod",
    program: script ? process.execPath : binary,
    args: [
      ...(script ? [binary] : []),
      "--dbpath",
      paths.mongo,
      "--port",
      String(port),
      "--bind_ip",
      "127.0.0.1",
      "--replSet",
      REPLICA_SET,
    ],
    cwd: paths.mongo,
    env: process.env,
    logs: paths.logs,
  });
  try {
    await waitForOwnPort(port, record, READY_TIMEOUT_MS);
    await initiateReplicaSet(port, from);
  } catch (error) {
    await stopRecorded([record]);
    throw error;
  }
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
 * Makes the mongod on `port` the only member of the replica set, unless its
 * data folder already holds the set, and waits until it accepts writes.
 *
 * @param {number} port The port of the mongod
 * @param {string[]} from Folders to resolve the driver from
 * @returns {Promise<void>} Resolves once the member is primary
 * @throws When it is not primary within the startup timeout
 */
function initiateReplicaSet(port, from) {
  const url = `mongodb://127.0.0.1:${port}/?directConnection=true`;
  return withClient(url, from, async (client) => {
    /** @type {unknown} */
    const admin = databaseOf(client, "admin").admin();
    if (!isCommander(admin))
      throw new TypeError("The admin handle of the driver has no command");
    try {
      await admin.command({
        replSetInitiate: {
          _id: REPLICA_SET,
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
    } catch (error) {
      if (!isAlreadyInitialized(error)) throw error;
    }
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const hello = decode(
        isHello,
        await admin.command({ hello: 1 }),
        "hello",
        "the state of a replica set member",
      );
      if (hello.isWritablePrimary) return;
      await sleep(PRIMARY_POLL_MS);
    }
    throw new Error(`mongod on ${port} did not become primary`);
  });
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
