import {
  failureMessage,
  missingClient,
  noAnswerReason,
  type Probe,
  type RelationAccess,
  refusedBy,
  signedIn,
  summarizeRelations,
  unanswered,
} from "./database-access";
import { loadClient } from "./probe-client";
import type { RethinkdbClient, RethinkdbConnection } from "./rethinkdb-client";

type Reql = RethinkdbClient["r"];

const WRONG_ACCOUNT = "The database refused this user name or password.";
const NO_DATABASE = "The server has no database with this name.";
const NO_DATABASE_NAMED =
  "The URL names no database: add its name after the host and port.";
const AUTH_ERROR = "ReqlAuthError";
const DEFAULT_PORT = 28015;
const DEFAULT_USER = "admin";
const MS_PER_SECOND = 1000;
const TABLES_AT_ONCE = 32;

/**
 * A key no row has, whose deletion the server allows to an account that may write to the table
 * and refuses to one that may not. The same key as `UNREACHABLE_KEY` in the catalog of
 * `@antelopejs/rethinkdb` 1.8.0 (`dist/implementations/catalog/discovery.js`).
 */
const UNREACHABLE_KEY = "__antelopejs_write_probe__ no row has this key";

interface Target {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** The address as `ParseUrl` in `dist/config.js` of `@antelopejs/rethinkdb` reads it. */
function parseUrl(url: string): Target {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : DEFAULT_PORT,
    user: decodeURIComponent(parsed.username) || DEFAULT_USER,
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
}

/**
 * What the account may do to a table. It reads when the server answers `info()`, which is the
 * first query of `ListTable` in the same catalog, and it writes when the server allows the
 * deletion of the key no row has, which is `Writes` there.
 */
async function tableAccess(
  r: Reql,
  connection: RethinkdbConnection,
  database: string,
  name: string,
): Promise<RelationAccess> {
  const table = r.db(database).table(name);
  const [readable, writable] = await Promise.all([
    table
      .info()
      .run(connection)
      .then(
        () => true,
        () => false,
      ),
    table
      .get(UNREACHABLE_KEY)
      .delete()
      .run(connection)
      .then(
        () => true,
        () => false,
      ),
  ]);
  return { readable, writable };
}

async function accessOfTables(
  r: Reql,
  connection: RethinkdbConnection,
  database: string,
  names: readonly string[],
): Promise<RelationAccess[]> {
  const access: RelationAccess[] = [];
  for (let first = 0; first < names.length; first += TABLES_AT_ONCE) {
    const batch = names.slice(first, first + TABLES_AT_ONCE);
    access.push(
      ...(await Promise.all(
        batch.map((name) => tableAccess(r, connection, database, name)),
      )),
    );
  }
  return access;
}

/**
 * Checks a RethinkDB connection with `rethinkdb-ts`, on the database the URL's path names: it
 * signs in, times a first query, and asks the server what the account may do to each table. A URL
 * that names no database is answered once the account has signed in, as one that cannot be read.
 * The write check deletes a key no row has, so it changes nothing. The client's `timeout` bounds
 * only the connecting, so the check closes the connection, whatever the server stops answering.
 */
export const probeRethinkdb: Probe = async (url, timeoutMs, connections) => {
  const rethinkdb = loadClient("rethinkdb-ts");
  if (!rethinkdb) {
    return missingClient("rethinkdb-ts", "RethinkDB");
  }
  const { r } = rethinkdb;
  try {
    const target = parseUrl(url);
    const connection = await r.connect({
      host: target.host,
      port: target.port,
      user: target.user,
      password: target.password,
      timeout: timeoutMs / MS_PER_SECOND,
      silent: true,
    });
    connections.add(() => connection.close());
    connection.on("error", () => undefined);
    const started = performance.now();
    await r.expr(1).run(connection);
    const latencyMs = Math.ceil(performance.now() - started);
    if (target.database === "") {
      return signedIn(
        latencyMs,
        target.user,
        { canRead: false, canWrite: false },
        NO_DATABASE_NAMED,
      );
    }
    const names = await r
      .db(target.database)
      .tableList()
      .run(connection)
      .catch((error: unknown) =>
        error instanceof Error && error.message.includes("does not exist")
          ? undefined
          : Promise.reject(error),
      );
    if (!names) {
      return signedIn(
        latencyMs,
        target.user,
        { canRead: false, canWrite: false },
        NO_DATABASE,
      );
    }
    return signedIn(
      latencyMs,
      target.user,
      summarizeRelations(
        await accessOfTables(r, connection, target.database, names),
      ),
    );
  } catch (error) {
    if (rethinkdb.isRethinkDBError(error) && error.name === AUTH_ERROR) {
      return refusedBy(WRONG_ACCOUNT);
    }
    return unanswered(noAnswerReason(failureMessage(error), url));
  }
};
