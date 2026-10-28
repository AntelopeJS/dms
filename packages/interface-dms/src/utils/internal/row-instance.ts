const INSTANCE_FIELD = "_instance";

/** @internal */
// oxlint-disable-next-line anti-slop/no-object-parameters -- The published helper accepts object; AntelopeJS row types do not declare the private _instance field.
export function getRowInstance(row: object): string {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published object-to-string helper trusts the database row's private _instance field without validation; narrowing or rejecting other objects changes that contract.
  return (row as Record<string, string>)[INSTANCE_FIELD];
}
