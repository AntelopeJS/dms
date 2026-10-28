import { isBoolean } from "./type-check";
import type { DataTypeFormatter } from "../composables/data-types/useDataType";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { RowActionRule, RowActionConfig } from "../types/row-action";
import {
  FIELD_KEY,
  FIELD_OPERATORS,
  LOGICAL_OPERATOR_KEYS,
} from "../types/row-action-operators";

type RuleEvaluator = (
  rule: RowActionRule,
  row: NonNullable<Parameters<DataTypeFormatter>[3]>,
) => boolean;

type RuleDictionary = Record<
  ReturnType<typeof Object.entries>[number][0],
  Parameters<typeof FIELD_OPERATORS.equals.compare>[0]
>;

const createLogicalEvaluators = (evaluate: RuleEvaluator) => ({
  and: (val: RuleDictionary[string], row: Parameters<RuleEvaluator>[1]) =>
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Operator presence does not validate its payload. Owner rule types cannot prove dynamically indexed values; retain the unchecked every call and its existing failures.
    (val as RowActionRule[]).every((r) => evaluate(r, row)),
  or: (val: RuleDictionary[string], row: Parameters<RuleEvaluator>[1]) =>
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The existing rule contract assumes an array here without checking it. Inference cannot prove that assumption and guards would change malformed-input failures.
    (val as RowActionRule[]).some((r) => evaluate(r, row)),
  not: (val: RuleDictionary[string], row: Parameters<RuleEvaluator>[1]) =>
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Payload is not runtime-validated. Owner types cannot prove this dynamic value; preserve recursive evaluation's existing behavior.
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
  const ruleObj: RuleDictionary = rule;
  const logicalEvaluators = getLogicalEvaluators();

  for (const operator of LOGICAL_OPERATOR_KEYS) {
    if (operator in ruleObj) {
      return logicalEvaluators[operator](ruleObj[operator], row);
    }
  }

  if (FIELD_KEY in ruleObj) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Presence does not validate the field path. Inference leaves it unknown; adding validation would alter get's existing malformed-input behavior.
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

export const normalizeActionConfig = (
  value: boolean | RowActionConfig | undefined,
): RowActionConfig => {
  if (isBoolean(value)) {
    return { isEnabled: value };
  }
  if (!value) {
    return { isEnabled: false };
  }
  return { isEnabled: true, ...value };
};

export const isActionEnabled = (
  value: boolean | RowActionConfig | undefined,
): boolean => normalizeActionConfig(value).isEnabled ?? false;

export const isActionVisible = (
  value: boolean | RowActionConfig | undefined,
): boolean => normalizeActionConfig(value).isVisible === true;

export const createActionValidator = (
  actionConfig: RowActionConfig,
  allRows: Parameters<RuleEvaluator>[1][],
  idKey: string,
) => {
  const config = normalizeActionConfig(actionConfig);

  return {
    canPerformAction: (rowId: string): boolean => {
      if (!config.isEnabled) return false;
      if (!config.rule) return true;

      const row = allRows.find((r) => get(r, idKey) === rowId);
      return row ? evaluateRowActionRule(config.rule, row) : false;
    },
  };
};
