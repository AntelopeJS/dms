import type { ActionTarget } from "../composables/table-view/types/action-target";
import type { RowActionRule } from "#dms-core/app/types/row-action";

export interface CustomRowAction {
  label: string;
  icon?: string;
  target: ActionTarget;
  rule?: RowActionRule;
  visible?: boolean;
  /** Preferred row-click target when its rule accepts the row. */
  isDefault?: boolean;
}
