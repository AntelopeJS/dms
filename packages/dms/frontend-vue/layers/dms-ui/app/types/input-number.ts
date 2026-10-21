/**
 * Why a number field keeps another value than the one typed: above its `max`,
 * below its `min`, or off its `step`.
 */
export type InputNumberAdjustmentReason = "min" | "max" | "step";

/**
 * What `DmsInputNumber` emits as `adjust` when it settles a typed number on
 * another value (on leaving the field, or on Enter): 1020 typed in a field of
 * steps of 50 gives `{ typed: 1020, value: 1000, reason: "step" }`.
 */
export interface InputNumberAdjustment {
  /** The number as typed. */
  typed: number;
  /** The number the field keeps, and now shows. */
  value: number;
  reason: InputNumberAdjustmentReason;
}
