import type { DatabaseAccess } from "@antelopejs/interface-dms-builder";
import net from "node:net";
import { z } from "zod";
import { postgresAccess, type PostgresRelationRow } from "./access-postgres";
import {
  failureMessage,
  hasControlCharacter,
  missingClient,
  noAnswerReason,
  type Probe,
  refusedBy,
  serverRefusal,
  signedIn,
  unanswered,
} from "./database-access";
import { loadClient } from "./probe-client";

const WRONG_ACCOUNT = "The database refused this user name or password.";
const NOT_ALLOWED_HERE =
  "The database does not let this account connect from here.";
const NO_DATABASE = "The server has no database with this name.";
const INVALID_LOGIN_STATE = "28P01";
const INVALID_AUTHORIZATION = "28000";
const UNKNOWN_DATABASE = "3D000";
const NEEDS_SIGN_IN = "This server asks for a user name and a password.";
const NO_USER =
  "The URL names no user: add it before the host, as postgres://user:password@host/database.";
const LOCAL_FILES =
  "The connection check reads no certificate or key file: remove sslcert, sslkey and sslrootcert from the URL, and connect with sslmode=require or put the CA in the system trust store.";
const UNREADABLE_URL = "This URL could not be read.";
const NO_HOST =
  "The URL names no host: add it after the user name, as postgres://user:password@host/database.";

const SSL_VALUE =
  "The ssl of the URL must be true, 1, 0 or no-verify; or set sslmode to disable, prefer, require, verify-ca or verify-full.";

/** An `ssl` `pg` kept as text, which is no TLS setting: empty text asks for no TLS. */
const SslText = z.string().min(1);

/**
 * The URL parameters for which `pg` reads a file of this computer. It reads them synchronously,
 * while it parses the URL and again when it builds the client, so no deadline bounds the read.
 */
const LOCAL_FILE_PARAMETERS = new Set(["sslcert", "sslkey", "sslrootcert"]);

/** Thrown in place of a password the URL does not give, so `pg` sends none. */
class PasswordWithheld extends Error {}

function withholdPassword(): never {
  throw new PasswordWithheld(NEEDS_SIGN_IN);
}

const ACCOUNT_SQL = "SELECT current_user AS role";

/**
 * The relations the account sees and what it may do to each. Mirrors `RELATIONS_SQL` of
 * `@antelopejs/postgres` 0.2.8 (`dist/implementations/database/external-discovery.js`): the same
 * relation kinds, the same schemas left out, the same `has_schema_privilege` and
 * `has_table_privilege` calls, without the columns the check does not read.
 */
const RELATIONS_SQL = `
  SELECT has_table_privilege(c.oid, 'SELECT') AS readable,
    has_table_privilege(c.oid, 'INSERT') AS insert,
    has_table_privilege(c.oid, 'UPDATE') AS update,
    has_table_privilege(c.oid, 'DELETE') AS delete
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND NOT c.relispartition
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg\\_%'
    AND has_schema_privilege(n.oid, 'USAGE')`;

function refusal(
  code: string | undefined,
  message: string,
  url: string,
): DatabaseAccess {
  switch (code) {
    case INVALID_LOGIN_STATE:
      return refusedBy(WRONG_ACCOUNT);
    case INVALID_AUTHORIZATION:
      return refusedBy(NOT_ALLOWED_HERE);
    case UNKNOWN_DATABASE:
      return refusedBy(NO_DATABASE);
    default:
      return refusedBy(serverRefusal(message, url));
  }
}

/** What splits a URL into the `key=value` pairs `pg` could read: wherever a query could start or go on. */
const PAIR_SEPARATORS = /[?&]/;

function decodedKey(pair: string): string {
  const key = pair.split("=", 1)[0] ?? "";
  try {
    return decodeURIComponent(key).toLowerCase();
  } catch {
    return key.toLowerCase();
  }
}

/**
 * Why the check refuses `url` before `pg` reads it: a control character the WHATWG parser of
 * `pg-connection-string` would drop, or a parameter for which `pg` reads a file of this computer,
 * synchronously, while it parses the URL. Every pair of the whole URL is read, decoded and
 * lowercased, which finds whatever key `pg` would find. `undefined` when `pg` may read the URL.
 */
function localRefusal(url: string): string | undefined {
  if (hasControlCharacter(url)) {
    return UNREADABLE_URL;
  }
  const keys = url.split(PAIR_SEPARATORS).slice(1).map(decodedKey);
  return keys.some((key) => LOCAL_FILE_PARAMETERS.has(key))
    ? LOCAL_FILES
    : undefined;
}

/** What `pg` read in the URL, as its own parser and its own client resolved it. */
const Present = z
  .string()
  .nullish()
  .transform((value) => (value ? value : undefined));
const ReadUrl = z.object({ host: Present, user: Present, password: Present });

/**
 * Why the check refuses the URL `pg` read, from what `parse`, the parser `pg` reads it with, gave
 * and the `ssl` the client resolved: no user or no host, which `pg` would fill with the user this
 * computer runs as and `localhost`, or an `ssl` it kept as text, which it reads a key of once the server accepts TLS, on a socket
 * event outside any promise, so the process exits. An empty `ssl` asks for no TLS.
 */
function readRefusal(
  read: z.infer<typeof ReadUrl>,
  sslIsText: boolean,
): string | undefined {
  if (read.user === undefined) {
    return NO_USER;
  }
  if (read.host === undefined) {
    return NO_HOST;
  }
  return sslIsText ? SSL_VALUE : undefined;
}

/**
 * What `build` returns, run with an empty environment: `pg` reads `PGPASSWORD`, `PGUSER`,
 * `PGSSLMODE` and the other `PG*` variables while it builds a client, and none of them may reach the
 * host the URL names. The swap is synchronous, so no other code runs while it holds.
 */
function withoutEnvironment<Built>(build: () => Built): Built {
  const environment = process.env;
  process.env = {};
  try {
    return build();
  } finally {
    process.env = environment;
  }
}

/**
 * Checks a PostgreSQL connection with `pg`: it signs in, reads the account the server reports and
 * its privileges over the relations it sees, and leaves the client for the check to close. It runs
 * no statement that writes. `pg` ends a client by saying goodbye and waiting for the server to
 * close, so the probe keeps the client's socket to shut it when the server does not.
 */
export const probePostgres: Probe = async (url, timeoutMs, connections) => {
  const pg = loadClient("pg");
  if (!pg) {
    return missingClient("pg", "PostgreSQL");
  }
  const local = localRefusal(url);
  const connectionStrings = loadClient("pg-connection-string");
  if (local !== undefined || !connectionStrings) {
    return unanswered(local ?? UNREADABLE_URL);
  }
  const sockets: net.Socket[] = [];
  let client: InstanceType<typeof pg.Client>;
  let read: z.infer<typeof ReadUrl>;
  try {
    read = ReadUrl.parse(connectionStrings.parse(url));
    client = withoutEnvironment(
      () =>
        new pg.Client({
          connectionString: url,
          connectionTimeoutMillis: timeoutMs,
          query_timeout: timeoutMs,
          statement_timeout: timeoutMs,
          stream: () => {
            const socket = new net.Socket();
            sockets.push(socket);
            return socket;
          },
        }),
    );
  } catch {
    return unanswered(UNREADABLE_URL);
  }
  const refused = readRefusal(read, SslText.safeParse(client.ssl).success);
  if (refused !== undefined) {
    return unanswered(refused);
  }
  if (read.password === undefined) {
    Object.defineProperty(client, "password", {
      configurable: true,
      writable: true,
      value: withholdPassword,
    });
  }
  client.on("error", () => undefined);
  connections.add(
    () => client.end(),
    () => {
      for (const socket of sockets) {
        socket.destroy();
      }
    },
  );
  try {
    await client.connect();
    const started = performance.now();
    const account = await client.query<{ role: string }>(ACCOUNT_SQL);
    const latencyMs = Math.ceil(performance.now() - started);
    const relations = await client.query<PostgresRelationRow>(RELATIONS_SQL);
    return signedIn(
      latencyMs,
      account.rows[0]?.role ?? "",
      postgresAccess(relations.rows),
    );
  } catch (error) {
    if (error instanceof PasswordWithheld) {
      return refusedBy(NEEDS_SIGN_IN);
    }
    if (error instanceof pg.DatabaseError) {
      return refusal(error.code, error.message, url);
    }
    return unanswered(noAnswerReason(failureMessage(error), url));
  }
};
