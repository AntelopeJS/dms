import { type Privileges, summarizeRelations } from "./database-access";

/** One relation of `RELATIONS_SQL` in `probe-mysql.ts`, each privilege as the server's `0` or `1`. */
export interface MysqlRelationRow {
  readable: number;
  insert: number;
  update: number;
  delete: number;
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
      readable: row.readable === 1,
      writable: row.insert === 1 || row.update === 1 || row.delete === 1,
    })),
  );
}
