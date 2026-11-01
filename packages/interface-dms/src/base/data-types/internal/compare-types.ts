import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
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

/** @internal Keeps `comparison` to the rows whose value is set. */
export function whenValueSet(
  proxy: ValueProxy<unknown>,
  comparison: ValueProxyOrValue<boolean>,
): ValueProxyOrValue<boolean> {
  return proxy.default(null).ne(null).and(comparison);
}
