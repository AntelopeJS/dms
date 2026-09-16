const INSTANCE_FIELD = "_instance";

// `object` is the contract: every AntelopeJS table row carries the instance id
// on this private field, and no public type declares it.
// oxlint-disable-next-line anti-slop/no-object-parameters
export function getRowInstance(row: object): string {
  return (row as Record<string, string>)[INSTANCE_FIELD];
}
