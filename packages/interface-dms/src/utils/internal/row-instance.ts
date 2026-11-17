import { isString } from "./type-check";

const INSTANCE_FIELD = "_instance";

/** Whether `row` holds an `_instance` field itself, whatever its value. */
function ownsInstanceField<Row extends object>(
  row: Row,
): row is Row & { [INSTANCE_FIELD]: unknown } {
  return Object.hasOwn(row, INSTANCE_FIELD);
}

/** @internal */
// oxlint-disable-next-line anti-slop/no-object-parameters -- The published helper accepts object; AntelopeJS row types do not declare the private _instance field.
export function getRowInstance(row: object): string {
  const instance = ownsInstanceField(row) ? row[INSTANCE_FIELD] : undefined;
  if (!isString(instance)) {
    throw new TypeError(
      "The row carries no _instance id: only a cross-instance query stamps one",
    );
  }
  return instance;
}
