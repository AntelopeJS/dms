/** @internal @packageDocumentation */
import type { RowActionRule } from "../../types/row-action";
import { assertRowRule } from "./row-rule-shape";

/** @internal */
export function eraseRowType<T extends object>(
  rule: RowActionRule<T> | undefined,
): RowActionRule | undefined {
  if (rule === undefined) return undefined;
  assertRowRule(rule, "A table view's row rule");
  return rule;
}
