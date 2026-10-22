import type { DataType } from "#dms-core/app/composables/data-types/useDataType";

/**
 * What a read-only field shows: for a type whose form state is mapped from
 * the value the server sent (a relation loaded as its row, held as its id),
 * that value while the state still references it, so the field reads as the
 * table cell does — the row's label and avatar rather than its id. Any other
 * value, or one the form changed, is shown as the state holds it.
 */
export function readonlyFieldValue(
  value: unknown,
  loaded: unknown,
  dataType: DataType | undefined,
  options?: unknown,
): unknown {
  if (!dataType?.beforeStateMapper || !dataType.isSameValue) return value;
  if (loaded === undefined || loaded === null) return value;
  return dataType.isSameValue(value, loaded, options) ? loaded : value;
}
