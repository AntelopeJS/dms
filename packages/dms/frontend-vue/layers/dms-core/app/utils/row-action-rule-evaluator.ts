import { isBoolean } from "./type-check";
import type { DataTypeFormatter } from "../composables/data-types/useDataType";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { RowActionRule, RowActionConfig } from "../types/row-action";
import { FIELD_KEY, FIELD_OPERATORS } from "../types/row-action-operators";

type RuleEvaluator = (
  rule: RowActionRule,
  row: NonNullable<Parameters<DataTypeFormatter>[3]>,
) => boolean;

type RuleDictionary = Record<
  ReturnType<typeof Object.entries>[number][0],
  Parameters<typeof FIELD_OPERATORS.equals.compare>[0]
>;

export const evaluateRowActionRule: RuleEvaluator = (rule, row) => {
  if ("and" in rule)
    return rule.and.every((r) => evaluateRowActionRule(r, row));
  if ("or" in rule) return rule.or.some((r) => evaluateRowActionRule(r, row));
  if ("not" in rule) return !evaluateRowActionRule(rule.not, row);

  if (FIELD_KEY in rule) {
    const ruleObj: RuleDictionary = rule;
    const fieldValue = get(row, rule.field);
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
