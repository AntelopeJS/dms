const INSTANCE_FIELD = "_instance";

// oxlint-disable-next-line anti-slop/no-object-parameters -- AntelopeJS row objects carry the private _instance field, which their public types do not declare.
/** @internal */
export function getRowInstance(row: object): string {
  return (row as Record<string, string>)[INSTANCE_FIELD];
}
