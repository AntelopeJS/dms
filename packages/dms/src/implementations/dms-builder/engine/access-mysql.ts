import { type Privileges, summarizeRelations } from "./database-access";

/** What the account may do with one relation, as `probe-mysql.ts` reads it. */
export interface MysqlRelationRow {
  readable: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * What a MySQL or MariaDB account may do, from the relations it sees. It writes when any of them
 * grants it INSERT, UPDATE or DELETE, and reads one it may SELECT from as a whole, as `Summarize`
 * of the catalog of `@antelopejs/mysql` 0.1.0 (`src/implementations/database/external-discovery.ts`)
 * decides: a grant on some columns only does not count.
 */
export function mysqlAccess(rows: readonly MysqlRelationRow[]): Privileges {
  return summarizeRelations(
    rows.map((row) => ({
      readable: row.readable,
      writable: row.insert || row.update || row.delete,
    })),
  );
}
