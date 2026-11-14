import type { DatabaseAccess } from "@antelopejs/interface-dms-builder";
import type { Connection as PromiseConnection } from "mysql2/promise";
import net from "node:net";
import { z } from "zod";
import { type MysqlRelationRow, mysqlAccess } from "./access-mysql";
import {
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
const DATABASE_DENIED = "This account may not use this database.";
const NO_DATABASE_NAMED =
  "The URL names no database: add its name after the host and port.";

/** The sentence for each server error a person can act on, by the code `mysql2` gives it. */
const REFUSALS = new Map([
  ["ER_ACCESS_DENIED_ERROR", WRONG_ACCOUNT],
  ["ER_HOST_NOT_PRIVILEGED", NOT_ALLOWED_HERE],
  ["ER_BAD_DB_ERROR", NO_DATABASE],
  ["ER_DBACCESS_DENIED_ERROR", DATABASE_DENIED],
]);

const ACCOUNT_SQL = "SELECT CURRENT_USER() AS user, DATABASE() AS name";

/**
 * The relations of the URL's database, with whether the account holds SELECT, INSERT and UPDATE on
 * every column of each. Mirrors `Relations` of `@antelopejs/mysql` (`src/dialect/mysql/external-catalog.ts`):
 * `information_schema.COLUMNS.PRIVILEGES` is the server's own reckoning for the session, roles and
 * the roles they hold included, and never spells the account's name. Names are grouped and matched
 * as bytes, since MariaDB's catalog compares them without regard to case.
 */
const RELATIONS_SQL = `
  SELECT t.TABLE_SCHEMA AS rel_schema, t.TABLE_NAME AS rel_name, COALESCE(p.every_select, 0) AS can_select,
    COALESCE(p.every_insert, 0) AS can_insert, COALESCE(p.every_update, 0) AS can_update
  FROM information_schema.TABLES t
  LEFT JOIN (
    SELECT CAST(c.TABLE_SCHEMA AS BINARY) AS col_schema, CAST(c.TABLE_NAME AS BINARY) AS col_table,
      MIN(FIND_IN_SET('select', c.PRIVILEGES) > 0) AS every_select,
      MIN(FIND_IN_SET('insert', c.PRIVILEGES) > 0) AS every_insert,
      MIN(FIND_IN_SET('update', c.PRIVILEGES) > 0) AS every_update
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE()
    GROUP BY col_schema, col_table
  ) p ON p.col_schema = CAST(t.TABLE_SCHEMA AS BINARY) AND p.col_table = CAST(t.TABLE_NAME AS BINARY)
  WHERE t.TABLE_TYPE IN ('BASE TABLE', 'VIEW') AND t.TABLE_SCHEMA = DATABASE()`;

const AccountRows = z.array(
  z.object({ user: z.string(), name: z.string().nullable() }),
);

const RelationRows = z.array(
  z.object({
    rel_schema: z.string(),
    rel_name: z.string(),
    can_select: z.coerce.number(),
    can_insert: z.coerce.number(),
    can_update: z.coerce.number(),
  }),
);

type RelationRow = z.infer<typeof RelationRows>[number];

function ident(name: string): string {
  return `\`${name.replaceAll("`", "``")}\``;
}

/** The connection the probe prepares statements on, and never runs them. */
type Preparer = Pick<PromiseConnection, "prepare" | "unprepare">;

/**
 * Whether the server accepts `statement` from this account, as `Prepares` of `@antelopejs/mysql`
 * (`src/connection.ts`) asks it: a refusal the server answers is `false`, a network failure throws.
 */
async function prepares(client: Preparer, statement: string): Promise<boolean> {
  try {
    await client.prepare(statement);
    client.unprepare(statement);
    return true;
  } catch (error) {
    if (ServerError.safeParse(error).success) {
      return false;
    }
    throw error;
  }
}

/**
 * One relation's privileges, as `ParseRelations` of `@antelopejs/mysql`
 * (`src/implementations/database/external-catalog.ts`) settles them: readable once the server
 * prepares a whole-row SELECT, INSERT and UPDATE counted only on a readable relation, and DELETE
 * read by preparing one, since no column privilege tells it.
 */
async function relationAccess(
  client: Preparer,
  row: RelationRow,
): Promise<MysqlRelationRow> {
  const table = `${ident(row.rel_schema)}.${ident(row.rel_name)}`;
  const readable =
    row.can_select === 1 && (await prepares(client, `SELECT * FROM ${table}`));
  return {
    readable,
    insert: readable && row.can_insert === 1,
    update: readable && row.can_update === 1,
    delete: await prepares(client, `DELETE FROM ${table}`),
  };
}

/** What `mysql2` passes its stream factory: where to connect, as it read the URL. */
interface StreamRequest {
  config: { host: string; port: number; socketPath?: string };
}

/** What `mysql2` throws for an error the server answered, as opposed to one of the network. */
const ServerError = z.object({
  code: z.string().startsWith("ER_"),
  message: z.string(),
});

function refusal(
  { code, message }: z.infer<typeof ServerError>,
  url: string,
): DatabaseAccess {
  return refusedBy(REFUSALS.get(code) ?? serverRefusal(message, url));
}

/**
 * Checks a MySQL or MariaDB connection with `mysql2`: it signs in, reads the account the server
 * reports and its privileges over the relations of the URL's database, and leaves the connection
 * for the check to close. It runs no statement that writes. `mysql2` ends a connection by saying
 * goodbye and settles before the server has closed its end, and its `destroy` only ends the
 * socket's writing side. So the close waits for the server's end, and the probe keeps the socket
 * to shut it when the server never closes.
 */
export const probeMysql: Probe = async (url, timeoutMs, connections) => {
  const mysql = loadClient("mysql2");
  if (!mysql) {
    return missingClient("mysql2", "MySQL or MariaDB");
  }
  const sockets: net.Socket[] = [];
  const connection = mysql.createConnection({
    uri: url,
    connectTimeout: timeoutMs,
    stream: ({ config: { host, port, socketPath } }: StreamRequest) => {
      const socket = socketPath
        ? net.connect(socketPath)
        : net.connect(port, host);
      sockets.push(socket);
      return socket;
    },
  });
  connection.on("error", () => undefined);
  const client = connection.promise();
  connections.add(
    () =>
      new Promise<void>((resolve) => {
        connection.once("end", () => resolve());
        connection.end();
      }),
    () => {
      for (const socket of sockets) {
        socket.destroy();
      }
    },
  );
  try {
    await client.connect();
    const started = performance.now();
    const [accounts] = await client.query({
      sql: ACCOUNT_SQL,
      timeout: timeoutMs,
    });
    const latencyMs = Math.ceil(performance.now() - started);
    const account = AccountRows.parse(accounts)[0];
    if (!account?.name) {
      return signedIn(
        latencyMs,
        account?.user,
        { canRead: false, canWrite: false },
        NO_DATABASE_NAMED,
      );
    }
    const [relations] = await client.query({
      sql: RELATIONS_SQL,
      timeout: timeoutMs,
    });
    const rows: MysqlRelationRow[] = [];
    for (const row of RelationRows.parse(relations)) {
      rows.push(await relationAccess(client, row));
    }
    return signedIn(latencyMs, account.user, mysqlAccess(rows));
  } catch (error) {
    const server = ServerError.safeParse(error);
    return server.success
      ? refusal(server.data, url)
      : unanswered(noAnswerReason(failureMessage(error), url));
  }
};
