/** @internal @packageDocumentation */
import type { RowActionRule } from "../../types/row-action";

/** @internal */
export function eraseRowType<T extends object>(
  rule: RowActionRule<T> | undefined,
): RowActionRule | undefined {
  // SAFETY: A table view's row fields are named by string keys, so a rule over T names a string field and compares a value, which makes it a rule over the default row type.
  return rule as RowActionRule | undefined;
}
