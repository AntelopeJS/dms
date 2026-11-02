import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import {
  type AnyFieldRule,
  FIELD_OPERATORS,
} from "@antelopejs/interface-dms/base/types/row-action-operators";

type RuleEvaluator = (
  rule: RowActionRule,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This exported evaluator accepts arbitrary row fields; no narrower row type fits the rows of every table.
  row: Record<string, unknown>,
) => boolean;

type Row = Parameters<RuleEvaluator>[1];

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

/** Compares the value a dotted path reaches in the row, reading each key from the object itself. */
function evaluateFieldRule(rule: AnyFieldRule, row: Row): boolean {
  let fieldValue: unknown = row;
  for (const key of rule.field.split(".")) {
    if (!isRow(fieldValue)) {
      fieldValue = undefined;
      break;
    }
    fieldValue = Object.hasOwn(fieldValue, key) ? fieldValue[key] : undefined;
  }
  if ("equals" in rule) {
    return FIELD_OPERATORS.equals.compare(fieldValue, rule.equals);
  }
  if ("notEquals" in rule) {
    return FIELD_OPERATORS.notEquals.compare(fieldValue, rule.notEquals);
  }
  if ("in" in rule) {
    return FIELD_OPERATORS.in.compare(fieldValue, rule.in);
  }
  if ("notIn" in rule) {
    return FIELD_OPERATORS.notIn.compare(fieldValue, rule.notIn);
  }
  return false;
}

export const evaluateRowActionRule: RuleEvaluator = (rule, row) => {
  if ("and" in rule) {
    return rule.and.every((child) => evaluateRowActionRule(child, row));
  }
  if ("or" in rule) {
    return rule.or.some((child) => evaluateRowActionRule(child, row));
  }
  if ("not" in rule) {
    return !evaluateRowActionRule(rule.not, row);
  }

  return "field" in rule && evaluateFieldRule(rule, row);
};
