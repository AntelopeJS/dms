const INSTANCE_FIELD = "_instance";

/** @internal */
// oxlint-disable-next-line anti-slop/no-object-parameters -- The published helper accepts object; AntelopeJS row types do not declare the private _instance field.
export function getRowInstance(row: object): string {
  // SAFETY: Bug in the published return type, which promises a string. The value is a string exactly when the row comes from a cross-instance query, on whose rows the database layer stamps the instance id under _instance; for any other object the helper returns undefined.
  return (row as Record<string, string>)[INSTANCE_FIELD];
}
