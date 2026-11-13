import { type Privileges, summarizeRelations } from "./database-access";

/** One relation of `RELATIONS_SQL` in `probe-postgres.ts`, with the privileges `has_table_privilege` answers. */
export interface PostgresRelationRow {
  readable: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * What a PostgreSQL role may do, from the relations it sees. It writes when any of them grants it
 * INSERT, UPDATE or DELETE, which is `writes` in `Summarize` of the catalog of `@antelopejs/postgres`
 * 0.2.8 (`dist/implementations/database/external-discovery.js`). A relation it can read is one it
 * may SELECT from as a whole, which is `readable` there: a grant on some columns only does not count.
 */
export function postgresAccess(
  rows: readonly PostgresRelationRow[],
): Privileges {
  return summarizeRelations(
    rows.map((row) => ({
      readable: row.readable,
      writable: row.insert || row.update || row.delete,
    })),
  );
}
