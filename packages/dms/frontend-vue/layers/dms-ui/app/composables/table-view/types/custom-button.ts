import type { ActionTarget } from "./action-target";

export type CustomButtonVariant = "solid" | "outline" | "ghost" | "link";

export interface CustomButton {
  /** Set when a quick action can press the button. */
  id?: string;
  label: string;
  icon?: string;
  variant?: CustomButtonVariant;
  color?: ColorValue;
  target: ActionTarget;
}
