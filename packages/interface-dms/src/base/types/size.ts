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

export type ModalSize =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  /** The whole window: a near full-screen modal, a drawer as wide as the window. */
  | "full";
