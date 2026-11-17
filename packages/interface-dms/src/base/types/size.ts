export enum Size {
  tiny = "xs",
  small = "sm",
  medium = "md",
  large = "lg",
  huge = "xl",
}

/** The size tokens a component option accepts. */
export const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

export type SizeValue = Size | (string & {});

export type { ModalSize } from "../../component-options/action-target";
