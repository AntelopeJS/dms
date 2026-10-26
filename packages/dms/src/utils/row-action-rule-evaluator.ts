import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import {
  FIELD_KEY,
  FIELD_OPERATORS,
  LOGICAL_OPERATOR_KEYS,
} from "@antelopejs/interface-dms/base/types/row-action-operators";

const get = (
  obj: Parameters<RuleEvaluator>[1],
  path: string,
): ReturnType<typeof Reflect.get> => {
  const keys = path.split(".");
  let result: ReturnType<typeof Reflect.get> = obj;
  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = result[key];
  }
  return result;
};

type RuleEvaluator = (
  rule: RowActionRule,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This exported evaluator accepts arbitrary row fields; deriving the row from RuleEvaluator itself would be circular.
  row: Record<string, unknown>,
) => boolean;

const createLogicalEvaluators = (evaluate: RuleEvaluator) => ({
  and: (
    val: Parameters<Parameters<typeof Array.prototype.every>[0]>[0],
    row: Parameters<RuleEvaluator>[1],
  ) => val.every((r: RowActionRule) => evaluate(r, row)),
  or: (
    val: Parameters<Parameters<typeof Array.prototype.every>[0]>[0],
    row: Parameters<RuleEvaluator>[1],
  ) => val.some((r: RowActionRule) => evaluate(r, row)),
  not: (
    val: Parameters<Parameters<typeof Array.prototype.every>[0]>[0],
    row: Parameters<RuleEvaluator>[1],
  ) => !evaluate(val, row),
});

let cachedLogicalEvaluators: ReturnType<typeof createLogicalEvaluators>;
const getLogicalEvaluators = () => {
  if (!cachedLogicalEvaluators) {
    cachedLogicalEvaluators = createLogicalEvaluators(evaluateRowActionRule);
  }
  return cachedLogicalEvaluators;
};

/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Dynamic operator dispatch erases the rule union's operand correlation. Preserve operator priority and the existing unchecked rule contract rather than validating or changing comparator calls. */
export const evaluateRowActionRule: RuleEvaluator = (rule, row) => {
  const ruleObj: Record<string, unknown> = rule;
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
        const compare = def.compare;
        return compare(fieldValue, ruleObj[operator]);
      }
    }
  }

  return false;
};
/* oxlint-enable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion */
