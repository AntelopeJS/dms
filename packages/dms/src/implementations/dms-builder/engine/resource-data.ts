import { Schema } from "@antelopejs/interface-database";

/**
 * Delete every row of a resource's database table. `@Fixture` re-seeds a table
 * whose row count is 0, so wiping the rows lets a later resource that reuses the
 * name/table seed cleanly instead of inheriting stale documents.
 *
 * DB-agnostic (goes through the `@antelopejs/interface-database` abstraction, the
 * same handle the fixture loader uses). Returns `undefined` when the data was
 * cleared or there was nothing to clear (schema not registered — e.g. no DB
 * wired); returns an error detail string only when a wired DB actually failed the
 * delete, so the caller can surface a `data_not_dropped` warning.
 */
export async function dropResourceData(
  schemaId: string,
  tableName: string,
): Promise<string | undefined> {
  const schema = Schema.get(schemaId);
  if (!schema) {
    return undefined;
  }
  try {
    await schema.instance().table(tableName).delete().run();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
