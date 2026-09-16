import type { CustomRowAction } from "../types/row-action";
import type { RowActionConfig } from "../../../dms-core/app/types/row-action";
import {
  evaluateRowActionRule,
  normalizeActionConfig,
} from "../../../dms-core/app/utils/row-action-rule-evaluator";

/** The subset of row actions a row click can dispatch to. */
export interface RowClickActionOptions {
  edit?: boolean | RowActionConfig;
  details?: boolean | RowActionConfig;
  custom?: CustomRowAction[];
}

/** A custom action to dispatch, or the name of the built-in event to emit. */
export type RowClickAction = CustomRowAction | "edit" | "details";

const isEnabledForRow = (
  actionConfig: boolean | RowActionConfig | undefined,
  row: Record<string, unknown>,
): boolean => {
  const config = normalizeActionConfig(actionConfig);
  if (!config.isEnabled) return false;
  return !config.rule || evaluateRowActionRule(config.rule, row);
};

/**
 * Resolves what a click on `row` opens, or `undefined` when the row is inert.
 *
 * A custom action flagged `isDefault` wins over `edit`/`details`: an explicit
 * declaration beats the implicit built-in order. Callers must gate the row
 * hover affordance on this same result so a row never offers a click that
 * does nothing.
 */
export const resolveRowClickAction = (
  rowActions: RowClickActionOptions | undefined,
  row: Record<string, unknown>,
): RowClickAction | undefined => {
  const custom = rowActions?.custom?.find(
    (action) =>
      action.isDefault === true &&
      (!action.rule || evaluateRowActionRule(action.rule, row)),
  );
  if (custom) return custom;
  if (isEnabledForRow(rowActions?.edit, row)) return "edit";
  if (isEnabledForRow(rowActions?.details, row)) return "details";
  return undefined;
};
