import type { ActionTarget } from "./action-target";
import type { ActionConfirm } from "#dms-core/app/types/confirm-dialog";

export type CustomButtonVariant = "solid" | "outline" | "ghost" | "link";

export interface CustomButton {
  /** Set when a quick action can press the button. */
  id?: string;
  label: string;
  icon?: string;
  variant?: CustomButtonVariant;
  color?: ColorValue;
  target: ActionTarget;
  /** Asked before the target runs: a fixed dialog, or `{ from }`. */
  confirm?: ActionConfirm;
  /** Set by the server when the button cannot be pressed for this request. */
  disabled?: boolean;
  /** Why the button is disabled, shown in its tooltip. May be an i18n key. */
  disabledReason?: string;
  /**
   * Left out of the toolbar; still pressed by id (quick action, page header
   * action).
   */
  hidden?: boolean;
}
