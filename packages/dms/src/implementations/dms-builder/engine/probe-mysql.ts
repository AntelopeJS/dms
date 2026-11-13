import type { DatabaseAccess } from "@antelopejs/interface-dms-builder";
import net from "node:net";
import { z } from "zod";
import { mysqlAccess } from "./access-mysql";
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
 * The account the connection runs as, spelled as the privilege views spell a grantee. Mirrors
 * `GRANTEE` of `@antelopejs/mysql` 0.1.0 (`src/dialect/mysql/external-catalog.ts`).
 */
const GRANTEE =
  "CONCAT('''', SUBSTRING_INDEX(CURRENT_USER(), '@', 1), '''@''', SUBSTRING_INDEX(CURRENT_USER(), '@', -1), '''')";

function privilege(name: string): string {
  return `(EXISTS (SELECT 1 FROM information_schema.USER_PRIVILEGES u WHERE u.GRANTEE = ${GRANTEE} AND u.PRIVILEGE_TYPE = '${name}')
    OR EXISTS (SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES s WHERE s.GRANTEE = ${GRANTEE} AND s.TABLE_SCHEMA = t.TABLE_SCHEMA AND s.PRIVILEGE_TYPE = '${name}')
    OR EXISTS (SELECT 1 FROM information_schema.TABLE_PRIVILEGES p WHERE p.GRANTEE = ${GRANTEE} AND p.TABLE_SCHEMA = t.TABLE_SCHEMA AND p.TABLE_NAME = t.TABLE_NAME AND p.PRIVILEGE_TYPE = '${name}'))`;
}

/**
 * The relations of the URL's database and what the account may do to each. Mirrors `Relations` of
 * `@antelopejs/mysql` 0.1.0 (`src/dialect/mysql/external-catalog.ts`), which MariaDB shares: the
 * same relation types and the same privilege lookups, without the columns the check does not read.
 */
const RELATIONS_SQL = `
  SELECT ${privilege("SELECT")} AS readable, ${privilege("INSERT")} AS \`insert\`,
    ${privilege("UPDATE")} AS \`update\`, ${privilege("DELETE")} AS \`delete\`
  FROM information_schema.TABLES t
  WHERE t.TABLE_TYPE IN ('BASE TABLE', 'VIEW') AND t.TABLE_SCHEMA = DATABASE()`;

const AccountRows = z.array(
  z.object({ user: z.string(), name: z.string().nullable() }),
);

const RelationRows = z.array(
  z.object({
    readable: z.coerce.number(),
    insert: z.coerce.number(),
    update: z.coerce.number(),
    delete: z.coerce.number(),
  }),
);

/** What `mysql2` passes its stream factory: where to connect, as it read the URL. */
interface StreamRequest {
  config: { host: string; port: number };
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
    stream: ({ config: { host, port } }: StreamRequest) => {
      const socket = net.connect(port, host);
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
    return signedIn(
      latencyMs,
      account.user,
      mysqlAccess(RelationRows.parse(relations)),
    );
  } catch (error) {
    const server = ServerError.safeParse(error);
    return server.success
      ? refusal(server.data, url)
      : unanswered(noAnswerReason(failureMessage(error), url));
  }
};
