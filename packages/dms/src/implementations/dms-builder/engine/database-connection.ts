import path from "node:path";
import type {
  OpResult,
  ProjectConfigResult,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { databasePriority, defaultDatabaseProvider } from "./database-pin";
import { ownConnections } from "./own-connections";
import { recordedConnection } from "./mapped-modules";
import { loadsEnvFile } from "./project-env-loading";
import { findConfigFile, propertyKey } from "./modules";
import { invalidConfig } from "./ops";
import { resolveProjectRoot } from "./project";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  MODULES,
  moduleEntries,
  objectAt,
  openDraft,
  readableOverrides,
  propertyNamed,
  StepRefusal,
  stringOf,
} from "./project-config";
import {
  DATABASE_SOURCE_INTERFACES,
  mayNameSource,
  writtenModules,
} from "./project-config-readers";
import { configureProject } from "./project-config-ops";
import {
  EnvRefusal,
  envFileText,
  projectVariable,
  restoreProjectEnv,
  setProjectVariable,
} from "./project-env";
import { isScaffoldRefusal } from "./project-scaffold";

const URL_PATH = "config.url";
const PASSWORD_PARAMETER = "password";
const USER_PARAMETER = "user";

/** What a connection wired into the configuration, by module id. */
export interface ConnectionWiring {
  connection: string;
  driver: string;
  /** The local modules holding its tables: read through the driver, their record naming the connection. */
  modules: LocalModule[];
  /**
   * Local modules read through the driver whose record names no connection, as one made before
   * the record was: shown as the connection's tables module when it has no other, never removed.
   */
  unrecorded: LocalModule[];
  /**
   * Whether the driver was added for this connection alone, and goes with it: it is not the
   * project's own database, and no module or connection the removal leaves names it.
   */
  ownsDriver: boolean;
  /** The variable supplying the driver's `url`, when one does. */
  variable?: string;
  /** Every variable supplying the driver's configuration, `variable` among them. */
  variables: string[];
}

/** A connection's details as its URL holds them, the password left out. */
export interface ConnectionDetails {
  scheme: string;
  host: string;
  port: string;
  database: string;
  user: string;
  hasPassword: boolean;
  /** The URL parameters, `sslmode` among them. */
  options: Record<string, string>;
}

function localPath(entry: ObjectLiteralExpression): string | undefined {
  const source = propertyNamed(entry, "source")?.getInitializer();
  if (
    !Node.isObjectLiteralExpression(source) ||
    stringOf(propertyNamed(source, "type")?.getInitializer()) !== "local"
  ) {
    return undefined;
  }
  return stringOf(propertyNamed(source, "path")?.getInitializer());
}

/** The variables `envOverrides` maps into the driver's configuration, by the path they supply. */
function variablesOf(draft: ConfigDraft, driver: string): Map<string, string> {
  const prefix = `${MODULES}.${driver}.`;
  const supplying = new Map<string, string>();
  for (const property of (
    objectAt(draft, [ENV_OVERRIDES])?.getProperties() ?? []
  ).filter(Node.isPropertyAssignment)) {
    const target = stringOf(property.getInitializer());
    if (target?.startsWith(prefix)) {
      supplying.set(propertyKey(property.getNameNode()), target);
    }
  }
  return supplying;
}

function openConfig(): ConfigDraft | undefined {
  const configPath = findConfigFile();
  return configPath ? openDraft(configPath) : undefined;
}

interface LocalModule {
  id: string;
  path: string;
}

/** The local modules that read `interface-database` through the driver, with the connection each records. */
function driverModules(
  entries: [string, ObjectLiteralExpression][],
  driver: string,
): (LocalModule & { recorded?: string })[] {
  const root = resolveProjectRoot();
  return entries
    .filter(([, entry]) =>
      readableOverrides(entry).some(
        (override) =>
          override.interface === DATABASE_INTERFACE &&
          override.id === undefined &&
          override.source === driver,
      ),
    )
    .flatMap(([id, entry]) => {
      const local = localPath(entry);
      return local
        ? [
            {
              id,
              path: local,
              recorded: recordedConnection(path.resolve(root, local)),
            },
          ]
        : [];
    });
}

/** The providers of `interface-database` the running project has, or none outside it. */
function databaseProviders(): string[] {
  try {
    return ownConnections(DATABASE_INTERFACE).flatMap((connection) =>
      connection.provider ? [connection.provider] : [],
    );
  } catch {
    return [];
  }
}

/**
 * Whether the driver is the connection's own: ranked below the project's own database, which a
 * module that does not pin `interface-database` keeps, and named by nothing the removal leaves.
 */
function ownsDriver(
  draft: ConfigDraft,
  wiring: { connection: string; driver: string; removed: Set<string> },
): boolean {
  const { connection, driver, removed } = wiring;
  const modules = writtenModules(draft);
  const shared = modules
    .filter(([id]) => !removed.has(id) && id !== driver)
    .some(([, entry]) =>
      mayNameSource(entry, driver, {
        ignored: (override) =>
          override.interface === CATALOG_INTERFACE &&
          override.id === connection,
        through: DATABASE_SOURCE_INTERFACES,
      }),
    );
  if (shared) {
    return false;
  }
  const priorityOf = (id: string) =>
    databasePriority(modules.find(([entryId]) => entryId === id)?.[1]);
  const priority = priorityOf(driver);
  if (priority === undefined) {
    return false;
  }
  if (priority < 0) {
    return true;
  }
  const providers = [...new Set(databaseProviders())];
  const projectDefault = defaultDatabaseProvider(providers, priorityOf);
  return (
    providers.includes(driver) &&
    projectDefault !== undefined &&
    projectDefault !== driver
  );
}

function wiringIn(
  draft: ConfigDraft,
  connection: string,
): ConnectionWiring | undefined {
  const entries = moduleEntries(draft);
  const driver = entries
    .flatMap(([, entry]) => readableOverrides(entry))
    .find(
      (override) =>
        override.interface === CATALOG_INTERFACE && override.id === connection,
    )?.source;
  if (!driver) {
    return undefined;
  }
  const reading = driverModules(entries, driver);
  const modules = reading
    .filter((module) => module.recorded === connection)
    .map(({ id, path: local }) => ({ id, path: local }));
  const unrecorded = reading
    .filter((module) => module.recorded === undefined)
    .map(({ id, path: local }) => ({ id, path: local }));
  const variables = variablesOf(draft, driver);
  return {
    connection,
    driver,
    modules,
    unrecorded,
    ownsDriver: ownsDriver(draft, {
      connection,
      driver,
      removed: new Set(modules.map((module) => module.id)),
    }),
    variable: [...variables].find(
      ([, target]) => target === `${MODULES}.${driver}.${URL_PATH}`,
    )?.[0],
    variables: [...variables.keys()],
  };
}

/** Whether `error` says why the configuration or a module folder cannot be read or changed. */
export function isConnectionRefusal(error: unknown): error is Error {
  return error instanceof StepRefusal || isScaffoldRefusal(error);
}

/** What the configuration wires for a connection, or nothing when no module declares it. */
export function connectionWiring(
  connection: string,
): ConnectionWiring | undefined {
  const draft = openConfig();
  return draft && wiringIn(draft, connection);
}

type UrlRead =
  | { ok: true; wiring: ConnectionWiring; url: URL }
  | { ok: false; message: string };

function wiredUrl(
  connection: string,
  wiring: ConnectionWiring | undefined,
): UrlRead {
  if (!wiring?.variable) {
    return {
      ok: false,
      message: `the connection "${connection}" has no variable supplying its URL`,
    };
  }
  const value = projectVariable(wiring.variable);
  if (value === undefined) {
    return {
      ok: false,
      message: `${wiring.variable} is not set in the project's .env`,
    };
  }
  try {
    return { ok: true, wiring, url: new URL(value) };
  } catch {
    return { ok: false, message: `${wiring.variable} does not hold a URL` };
  }
}

function connectionUrl(connection: string): UrlRead {
  try {
    return wiredUrl(connection, connectionWiring(connection));
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A database name as the driver reads it from the URL's path, with `decodeURI`. */
function decodedPath(text: string): string {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

/** A connection's details from the URL in `.env`, the password left out. */
export function connectionDetails(
  wiring: ConnectionWiring,
): OpResult<ConnectionDetails> {
  const read = wiredUrl(wiring.connection, wiring);
  if (!read.ok) {
    return invalidConfig<ConnectionDetails>(read.message);
  }
  const { url } = read;
  const { [PASSWORD_PARAMETER]: _password, ...options } = Object.fromEntries(
    url.searchParams,
  );
  return {
    ok: true,
    data: {
      scheme: url.protocol.replace(/:$/, ""),
      host: decoded(url.hostname),
      port: url.port,
      database: decodedPath(url.pathname.replace(/^\//, "")),
      user: decoded(url.username),
      hasPassword: savedPassword(url) !== undefined,
      options,
    },
    changes: [],
  };
}

/** The password a URL carries, as the `password` parameter the driver reads first, or in its user part. */
function savedPassword(url: URL): string | undefined {
  return url.searchParams.get(PASSWORD_PARAMETER) || url.password || undefined;
}

/** The user a URL logs in as: the `user` parameter, which the driver reads first, or its user part. */
function userOf(url: URL): string {
  return url.searchParams.get(USER_PARAMETER) || decoded(url.username);
}

/** Whether both URLs reach the same server as the same user, however each spells them. */
function sameServer(saved: URL, next: URL): boolean {
  return (
    decoded(saved.hostname) === decoded(next.hostname) &&
    saved.port === next.port &&
    userOf(saved) === userOf(next)
  );
}

/** `next` with the saved password, where the driver reads it in `saved`: the parameter first. */
function keepPassword(saved: URL, next: URL): void {
  const parameter = saved.searchParams.get(PASSWORD_PARAMETER);
  if (parameter) {
    next.searchParams.set(PASSWORD_PARAMETER, parameter);
    return;
  }
  next.password = saved.password;
}

/**
 * Writes a connection's new URL into `.env`. A URL with no password keeps the current one while it
 * reaches the same host, port and user, so the password never has to travel back to change something
 * else, and never follows the connection to another server. Takes effect on the next restart.
 */
export function setConnectionUrl(
  connection: string,
  value: string,
): OpResult<{ variable: string }> {
  const read = connectionUrl(connection);
  if (!read.ok) {
    return invalidConfig<{ variable: string }>(read.message);
  }
  let next: URL;
  try {
    next = new URL(value);
  } catch {
    return invalidConfig<{ variable: string }>(
      "the new details do not make a URL",
    );
  }
  if (next.protocol !== read.url.protocol) {
    return invalidConfig<{ variable: string }>(
      `the connection reads ${read.url.protocol.replace(/:$/, "")} URLs`,
    );
  }
  if (
    savedPassword(next) === undefined &&
    userOf(next) !== "" &&
    savedPassword(read.url) !== undefined
  ) {
    if (!sameServer(read.url, next)) {
      return invalidConfig<{ variable: string }>(
        "the password is kept only for the same host, port and user: enter the password for the new ones",
      );
    }
    keepPassword(read.url, next);
  }
  return writeConnectionUrl(read.wiring, next.href);
}

/**
 * Writes the URL into `.env` and, when the configuration does not load `.env` yet, the code that
 * does. When that write fails, `.env` goes back to what it held.
 */
function writeConnectionUrl(
  wiring: ConnectionWiring,
  url: string,
): OpResult<{ variable: string }> {
  const variable = wiring.variable ?? "";
  const loading = loadsEnvAlready();
  if (!loading.ok) {
    return loading;
  }
  const before = envFileText();
  try {
    setProjectVariable(variable, url);
  } catch (error) {
    if (error instanceof EnvRefusal) {
      return invalidConfig<{ variable: string }>(error.message);
    }
    throw error;
  }
  if (loading.data) {
    return { ok: true, data: { variable }, changes: [] };
  }
  let configured: OpResult<ProjectConfigResult>;
  try {
    configured = configureProject([
      {
        op: "ConfigureModule",
        id: wiring.driver,
        entry: { env: { url: variable } },
      },
    ]);
  } catch (error) {
    restoreProjectEnv(before);
    throw error;
  }
  if (!configured.ok) {
    restoreProjectEnv(before);
    return configured;
  }
  return { ok: true, data: { variable }, changes: configured.changes };
}

/**
 * Whether the configuration loads `.env` already. One that does not, from a project connected
 * before the builder wrote that code, gets it with the new URL, which would otherwise never reach
 * it; one that does is not written, so the project is not restarted.
 */
function loadsEnvAlready(): OpResult<boolean> {
  try {
    const draft = openConfig();
    return { ok: true, data: !draft || loadsEnvFile(draft.file), changes: [] };
  } catch (error) {
    if (isConnectionRefusal(error)) {
      return invalidConfig<boolean>(error.message);
    }
    throw error;
  }
}
