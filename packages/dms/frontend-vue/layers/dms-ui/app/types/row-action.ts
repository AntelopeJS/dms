import type { ActionTarget } from "../composables/table-view/types/action-target";
import type { RowActionRule } from "#dms-core/app/types/row-action";
import type { ActionConfirm } from "#dms-core/app/types/confirm-dialog";

export interface CustomRowAction {
  label: string;
  icon?: string;
  target: ActionTarget;
  /** Asked before the target runs: a fixed dialog, or `{ from }`. */
  confirm?: ActionConfirm;
  rule?: RowActionRule;
  /** Inline button instead of a menu entry (the backend serializes `isVisible`). */
  isVisible?: boolean;
  /** Legacy spelling of `isVisible`, still honoured. */
  visible?: boolean;
  /** Preferred row-click target when its rule accepts the row. */
  isDefault?: boolean;
  /** Color of the inline button or menu entry. */
  color?: ColorValue;
  /** Variant of the inline button; `ghost` by default. */
  variant?: "solid" | "outline" | "soft" | "ghost" | "link";
  /** The inline button shows its label next to its icon. */
  showLabel?: boolean;
}
