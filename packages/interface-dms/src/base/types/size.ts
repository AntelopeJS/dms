export enum Size {
  tiny = "xs",
  small = "sm",
  medium = "md",
  large = "lg",
  huge = "xl",
}

// Spelled out rather than derived from `Size`: a string-enum member is not
// assignable to a string literal, so `Object.values(Size)` would not give
// z.enum() the literal tuple it needs.
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
  | "5xl";
