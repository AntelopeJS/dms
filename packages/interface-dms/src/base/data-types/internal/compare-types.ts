import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
/** @internal */
export function absolutizeJoinedSchemas(meta: DataAPIMeta): void {
  if (meta.schemaName == null) {
    return;
  }
  for (const field of Object.values(meta.fields)) {
    if (field.joined && field.joined.schemaName == null) {
      field.joined.schemaName = meta.schemaName;
    }
  }
}
