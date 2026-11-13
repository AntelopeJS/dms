import { InterfaceFunction } from "@antelopejs/interface-core";
import type { ProjectConfigOpts, ProjectConfigResult } from "./project";
import type { OpResult } from "./results";

/** The engines a database can be checked on, by the name `CheckDatabaseConnection` takes. */
export type DatabaseEngine = "postgres" | "mongodb" | "rethinkdb";

/** The database to check: its engine, and a URL of that engine's scheme. */
export interface DatabaseCheckInput {
  engine: DatabaseEngine;
  url: string;
}

/** What a live check of a database found. */
export interface DatabaseAccess {
  /** Whether a server answered, even to refuse the sign-in. */
  reachable: boolean;
  /** The round trip of the first query the signed-in account made. */
  latencyMs?: number;
  /** The account the server reports. */
  user?: string;
  canRead: boolean;
  canWrite: boolean;
  /** A short sentence for the person who connects, whenever the database cannot be read. Never holds the URL, the password or a query. */
  reason?: string;
}

/** One of the builder's catalog connections, with what its provider's `Info()` answers about it. */
export interface CatalogConnectionEntry {
  id: string;
  /** The engine's name, e.g. `postgresql`. */
  engine?: string;
  /** The server's version. */
  version?: string;
  /** The database the connection is on. */
  database?: string;
  /** The role the connection runs as. */
  role?: string;
  /** Why the provider did not answer, in place of the fields above. */
  error?: string;
}

/**
 * The `interface-database` pin a module needs once a module that uses it pins another database:
 * core passes that pin on to the modules that import it, which would then be reached with two
 * bindings.
 */
export interface DatabasePin {
  module: string;
  provider: string;
}

/** What connecting a database needs to know about the project. */
export interface DatabaseProject {
  /** The modules the project's configuration lists, by id. */
  modules: string[];
  /** The id of the module the builder runs in, the entry its catalog connections are declared on. */
  self: string;
  /** The project's own `interface-database` provider, when it has one. */
  ownDatabase?: string;
  /** The modules to pin to the own database before another one is connected. */
  databasePins: DatabasePin[];
  /** The id the configuration gives dms-database, when the project has it. */
  dmsDatabase?: string;
}

/** A local module of the project, by its id in the configuration and its folder. */
export interface ConnectionModule {
  id: string;
  path: string;
}

/** What a connection wired into the configuration, by module id. */
export interface ConnectionWiring {
  connection: string;
  driver: string;
  /** The local modules holding its tables: read through the driver, their record naming the connection. */
  modules: ConnectionModule[];
  /**
   * Local modules read through the driver whose record names no connection, as one made before
   * the record was: shown as the connection's tables module when it has no other, never removed.
   */
  unrecorded: ConnectionModule[];
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

/** A connection's wiring, and its details when its URL can be read. */
export interface DatabaseConnection {
  wiring: ConnectionWiring;
  details?: ConnectionDetails;
}

/** The rows to sample from a relation of a catalog connection. */
export interface RowSampleRequest {
  relation: string;
  columns?: string[];
  /** At most the catalog's sample limit. */
  limit: number;
}

/** A sampled value as text, cut at the catalog's text length. */
export interface SampledText {
  text: string;
  truncated: boolean;
}

/** A binary value, answered by its length only. */
export interface SampledBinary {
  bytes: number;
}

export type SampledValue = SampledText | SampledBinary | null;

/** Rows of a relation, each value in the order of `columns`. */
export interface RowSample {
  relation: string;
  columns: string[];
  rows: SampledValue[][];
  /** How the relation was sampled before its first rows were read, when it was. */
  sample: { percent: number; rows: number } | null;
}

/**
 * The builder's catalog connections, each with its provider's `Info()` or why it did not answer.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const ListDatabaseConnections =
  InterfaceFunction<() => Promise<CatalogConnectionEntry[]>>();

/**
 * Connects to a database the caller names and reports what its account may do, before any
 * connection is written. In development only: elsewhere it fails with `unsupported`. An input that
 * is not an engine and a URL of that engine's scheme fails with `invalid_config`, naming the fields
 * and never their values. The engine's client package must be installed in the project.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const CheckDatabaseConnection =
  InterfaceFunction<
    (input: DatabaseCheckInput) => Promise<OpResult<DatabaseAccess>>
  >();

/**
 * Adds what the configuration of each connection made before the connect flow registered it with
 * dms-database is missing. Succeeds with no file when nothing is.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const RepairDatabaseConnections =
  InterfaceFunction<
    (opts?: ProjectConfigOpts) => Promise<OpResult<ProjectConfigResult>>
  >();

/**
 * The project's modules and the database pins connecting another database needs.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const GetDatabaseProject =
  InterfaceFunction<() => Promise<OpResult<DatabaseProject>>>();

/**
 * One connection's wiring and details; `not_found` when no module declares it.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const GetDatabaseConnection =
  InterfaceFunction<
    (connection: string) => Promise<OpResult<DatabaseConnection>>
  >();

/**
 * Takes a connection out of the configuration: its catalog connections, its tables module and
 * that module's folder, and its driver when it was added for this connection alone.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const RemoveDatabaseConnection =
  InterfaceFunction<
    (
      connection: string,
      opts?: ProjectConfigOpts,
    ) => Promise<OpResult<ProjectConfigResult>>
  >();

/**
 * Writes a connection's URL into the variable that supplies it. A URL with no password keeps the
 * current one. Answers the variable's name.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const SetDatabaseConnectionUrl =
  InterfaceFunction<
    (connection: string, url: string) => Promise<OpResult<{ variable: string }>>
  >();

/**
 * Sample rows of a relation of a catalog connection; `not_found` for an unknown connection.
 *
 * Owner path only: no MCP tool exposes it, so only an owner-authenticated entry calls it.
 */
export const SampleDatabaseRows =
  InterfaceFunction<
    (
      connection: string,
      request: RowSampleRequest,
    ) => Promise<OpResult<RowSample>>
  >();
