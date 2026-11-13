import { isString } from "./type-check";

const INSTANCE_FIELD = "_instance";

/** @internal */
// oxlint-disable-next-line anti-slop/no-object-parameters -- The published helper accepts object; AntelopeJS row types do not declare the private _instance field.
export function getRowInstance(row: object): string {
  const instance =
    Object.hasOwn(row, INSTANCE_FIELD) && INSTANCE_FIELD in row
      ? row[INSTANCE_FIELD]
      : undefined;
  if (!isString(instance)) {
    throw new TypeError(
      "The row carries no _instance id: only a cross-instance query stamps one",
    );
  }
  return instance;
}
