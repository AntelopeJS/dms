import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import {
  FIELD_KEY,
  FIELD_OPERATORS,
  LOGICAL_OPERATOR_KEYS,
} from "@antelopejs/interface-dms/base/types/row-action-operators";

const get = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split(".");
  let result: unknown = obj;
  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = (result as Record<string, unknown>)[key];
  }
  return result;
};

type RuleEvaluator = (
  rule: RowActionRule,
  row: Record<string, unknown>,
) => boolean;

const createLogicalEvaluators = (evaluate: RuleEvaluator) => ({
  and: (val: unknown, row: Record<string, unknown>) =>
    (val as RowActionRule[]).every((r) => evaluate(r, row)),
  or: (val: unknown, row: Record<string, unknown>) =>
    (val as RowActionRule[]).some((r) => evaluate(r, row)),
  not: (val: unknown, row: Record<string, unknown>) =>
    !evaluate(val as RowActionRule, row),
});

let cachedLogicalEvaluators: ReturnType<typeof createLogicalEvaluators>;
const getLogicalEvaluators = () => {
  if (!cachedLogicalEvaluators) {
    cachedLogicalEvaluators = createLogicalEvaluators(evaluateRowActionRule);
  }
  return cachedLogicalEvaluators;
};

export const evaluateRowActionRule: RuleEvaluator = (rule, row) => {
  const ruleObj = rule as Record<string, unknown>;
  const logicalEvaluators = getLogicalEvaluators();

  for (const operator of LOGICAL_OPERATOR_KEYS) {
    if (operator in ruleObj) {
      return logicalEvaluators[operator](ruleObj[operator], row);
    }
  }

  if (FIELD_KEY in ruleObj) {
    const fieldValue = get(row, ruleObj[FIELD_KEY] as string);
    for (const [operator, def] of Object.entries(FIELD_OPERATORS)) {
      if (operator in ruleObj) {
        const compare = def.compare as <T>(a: T, b: T | T[]) => boolean;
        return compare(fieldValue, ruleObj[operator]);
      }
    }
  }

  return false;
};
