/**
 * Readonly behavior for different modes
 */
export enum ReadonlyBehaviorType {
  disabled = "disabled",
  hidden = "hidden",
  default = "default",
}

/**
 * Readonly behavior configuration
 */
export interface ReadonlyBehaviorConfig {
  new?: ReadonlyBehaviorType;
  edit?: ReadonlyBehaviorType;
  view?: ReadonlyBehaviorType;
}

/**
 * Readonly behavior type (enum or config object)
 */
export type ReadonlyBehavior = ReadonlyBehaviorType | ReadonlyBehaviorConfig;
