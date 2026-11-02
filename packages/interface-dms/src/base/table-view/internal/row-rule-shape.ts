import type { RowActionRule } from "../../types/row-action";
import {
  FIELD_OPERATORS,
  LOGICAL_OPERATOR_KEYS,
} from "../../types/row-action-operators";
import { isNull, isObject } from "../../../utils/internal/type-check";

const isRuleObject = <T extends Record<string, unknown>>(
  value: RowActionRule<T>,
): value is RowActionRule<T> & object =>
  isObject(value) && !isNull(value) && !Array.isArray(value);

function operandProblem<T extends Record<string, unknown>>(
  operator: (typeof LOGICAL_OPERATOR_KEYS)[number],
  operand: RowActionRule<T> | RowActionRule<T>[],
  path: string,
): string | undefined {
  if (operator === "not") {
    return Array.isArray(operand)
      ? `${path} must be a rule object`
      : rowRuleProblem(operand, path);
  }
  if (!Array.isArray(operand)) return `${path} must be an array of rules`;
  return operand
    .map((entry, index) => rowRuleProblem(entry, `${path}[${index}]`))
    .find((problem) => problem !== undefined);
}

/**
 * What stops a row rule from compiling or evaluating, or `undefined` when its
 * shape holds. It checks the operand of the operator that dispatch selects (a
 * logical operator before a field comparison, the first present of each), at
 * every nesting level, so a rule it accepts never throws a `TypeError`.
 *
 * @internal
 */
export function rowRuleProblem<T extends Record<string, unknown>>(
  rule: RowActionRule<T>,
  path = "rule",
): string | undefined {
  if (!isRuleObject(rule)) return `${path} must be a rule object`;
  if ("and" in rule) return operandProblem("and", rule.and, `${path}.and`);
  if ("or" in rule) return operandProblem("or", rule.or, `${path}.or`);
  if ("not" in rule) return operandProblem("not", rule.not, `${path}.not`);
  const operands = new Map(Object.entries(rule));
  const comparison = Object.entries(FIELD_OPERATORS).find(([key]) =>
    operands.has(key),
  );
  if (!comparison) return undefined;
  const [operator, { isArray }] = comparison;
  return isArray && !Array.isArray(operands.get(operator))
    ? `${path}.${operator} must be an array`
    : undefined;
}
