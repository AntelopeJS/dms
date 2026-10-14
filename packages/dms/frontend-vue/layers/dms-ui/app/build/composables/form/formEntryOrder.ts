import type { FormFieldOrGroup } from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";

function entryOrder(entry: FormFieldOrGroup): number | undefined {
  return isFieldGroup(entry) ? entry.order : undefined;
}

/**
 * A form's entries with its groups' `order` applied: the groups giving one
 * trade the places they were declared at, sorted on it (equal orders keep
 * their declaration order); every other entry keeps its place.
 */
export function orderFormEntries<T extends FormFieldOrGroup>(
  entries: readonly T[],
): T[] {
  const ordered = entries
    .filter((entry) => entryOrder(entry) !== undefined)
    .sort((left, right) => entryOrder(left)! - entryOrder(right)!);
  let next = 0;
  return entries.map((entry) =>
    entryOrder(entry) === undefined ? entry : ordered[next++]!,
  );
}
