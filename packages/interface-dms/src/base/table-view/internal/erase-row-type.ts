/** @internal @packageDocumentation */
import type { RowActionRule } from "../../types/row-action";

/** @internal */
export function eraseRowType<T extends object>(
  rule: RowActionRule<T> | undefined,
): RowActionRule | undefined {
  // SAFETY: A rule over the module's row type T and the serialized envelope's rule over the default row type differ only in the key and value types of their field rules; serialization passes the rule through untouched, so its runtime shape is the same.
  return rule as RowActionRule | undefined;
}
