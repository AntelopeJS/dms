import { createRequire } from "node:module";

/**
 * The part of `rethinkdb-ts` that sets a server up for a test: its databases, tables, accounts and
 * permissions. The package's own declarations do not compile with this module's `lib`.
 */
interface Connection {
  close(): Promise<void>;
}

interface Term<Result = unknown> {
  run(connection: Connection): Promise<Result>;
}

/** What an account may do: `connect` is global, `read` and `write` are scoped to a database. */
export interface Permissions {
  connect?: boolean;
  read?: boolean;
  write?: boolean;
}

interface Row {
  id: number | string;
  total?: number;
  password?: string;
}

interface Database {
  tableCreate(name: string): Term;
  table(name: string): {
    insert(row: Row): Term;
    count(): Term<number>;
  };
  grant(user: string, permissions: Permissions): Term;
}

interface Admin {
  connect(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    silent: boolean;
  }): Promise<Connection>;
  dbCreate(name: string): Term;
  db(name: string): Database;
  grant(user: string, permissions: Permissions): Term;
}

type RequireAdmin = (name: "rethinkdb-ts") => { r: Admin };

const requireAdmin: RequireAdmin = createRequire(__filename);
const { r } = requireAdmin("rethinkdb-ts");

/** An account, and what it may do to the shop database. */
export interface Account {
  name: string;
  password: string;
  database?: Permissions;
}

function connectAsAdmin(port: number, adminPassword: string) {
  return r.connect({
    host: "127.0.0.1",
    port,
    user: "admin",
    password: adminPassword,
    silent: true,
  });
}

/** One database with two tables, one row in the first, and the accounts with their permissions. */
export async function setUpShop(
  port: number,
  adminPassword: string,
  accounts: Account[],
): Promise<void> {
  const connection = await connectAsAdmin(port, adminPassword);
  try {
    await r.dbCreate("shop").run(connection);
    await r.dbCreate("empty").run(connection);
    await r.db("shop").tableCreate("orders").run(connection);
    await r.db("shop").tableCreate("notes").run(connection);
    await r
      .db("shop")
      .table("orders")
      .insert({ id: 1, total: 1 })
      .run(connection);
    for (const account of accounts) {
      await r
        .db("rethinkdb")
        .table("users")
        .insert({ id: account.name, password: account.password })
        .run(connection);
      await r.grant(account.name, { connect: true }).run(connection);
      if (account.database) {
        await r
          .db("shop")
          .grant(account.name, account.database)
          .run(connection);
      }
    }
  } finally {
    await connection.close();
  }
}

/** Whether the server answers the administrator, which it does only once it has started. */
export async function answersAdmin(
  port: number,
  adminPassword: string,
): Promise<boolean> {
  try {
    await (await connectAsAdmin(port, adminPassword)).close();
    return true;
  } catch {
    return false;
  }
}

/** The rows a table of the shop database holds. */
export async function countRows(
  port: number,
  adminPassword: string,
  table: string,
): Promise<number> {
  const connection = await connectAsAdmin(port, adminPassword);
  try {
    return await r.db("shop").table(table).count().run(connection);
  } finally {
    await connection.close();
  }
}
