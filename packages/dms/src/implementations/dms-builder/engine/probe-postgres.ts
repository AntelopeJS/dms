import net from "node:net";
import { postgresAccess, type PostgresRelationRow } from "./access-postgres";
import {
  type DatabaseAccess,
  failureMessage,
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
  const sockets: net.Socket[] = [];
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
    stream: () => {
      const socket = new net.Socket();
      sockets.push(socket);
      return socket;
    },
  });
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
    if (error instanceof pg.DatabaseError) {
      return refusal(error.code, error.message, url);
    }
    return unanswered(noAnswerReason(failureMessage(error), url));
  }
};
