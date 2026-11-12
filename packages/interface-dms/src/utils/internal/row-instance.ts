const INSTANCE_FIELD = "_instance";

/** @internal */
// oxlint-disable-next-line anti-slop/no-object-parameters -- The published helper accepts object; AntelopeJS row types do not declare the private _instance field.
export function getRowInstance(row: object): string {
  // SAFETY: The published return type promises a string, while the private `_instance` field, which the declared row types omit, is read without a check; a row that lacks it answers undefined.
  return (row as Record<string, string>)[INSTANCE_FIELD];
}
