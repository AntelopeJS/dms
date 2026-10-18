import type { DataTypeValueComparer } from "#dms-core/app/composables/data-types/useDataType";

/**
 * What a read-only field shows: the value as the record was loaded while the
 * form still holds it, else the form's value. A type whose form state differs
 * from what the server sends keeps less in the state — a relation keeps the
 * ids its picker holds, the row loaded carries their labels — so showing the
 * state would print `cust-025` where the record names its customer.
 */
export function readonlyDisplayValue(
  value: unknown,
  loaded: unknown,
  isSameValue: DataTypeValueComparer | undefined,
  options?: unknown,
): unknown {
  if (loaded === undefined || loaded === null || !isSameValue) return value;
  return isSameValue(loaded, value, options) ? loaded : value;
}
