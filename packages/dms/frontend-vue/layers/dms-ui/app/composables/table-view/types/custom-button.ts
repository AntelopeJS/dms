import type { ActionTarget } from "./action-target";

export type CustomButtonVariant = "solid" | "outline" | "ghost" | "link";

export interface CustomButton {
  label: string;
  icon?: string;
  variant?: CustomButtonVariant;
  color?: ColorValue;
  target: ActionTarget;
}
