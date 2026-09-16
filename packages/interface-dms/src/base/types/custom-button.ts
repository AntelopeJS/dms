import type { Action } from "../../component";
import type { ActionTarget, ActionTargetSerialized } from "./action-target";
import type { ButtonVariant } from "./button";

export type ButtonColor =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "neutral";

export interface CustomButton {
  label: string;
  icon?: string;
  variant?: ButtonVariant;
  color?: ButtonColor;
  target: ActionTarget;
  /**
   * Gate the button behind a permission. A string names one of the owning
   * table's actions (e.g. `"add"`); an `Action` references any component's
   * action (e.g. another table's `add`). The button is stripped from the
   * serialized options when the caller lacks the permission.
   */
  permission?: string | Action;
}

export interface CustomButtonSerialized extends Omit<
  CustomButton,
  "target" | "permission"
> {
  target: ActionTargetSerialized;
}
