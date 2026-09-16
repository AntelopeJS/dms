import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { RowActionRule, RowActionConfig } from "../types/row-action";
import {
  FIELD_KEY,
  FIELD_OPERATORS,
  LOGICAL_OPERATOR_KEYS,
} from "../types/row-action-operators";

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

export const normalizeActionConfig = (
  value: boolean | RowActionConfig | undefined,
): RowActionConfig => {
  if (typeof value === "boolean") {
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
  allRows: Record<string, unknown>[],
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
