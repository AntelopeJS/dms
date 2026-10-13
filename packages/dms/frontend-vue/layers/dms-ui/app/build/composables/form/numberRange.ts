/** The bounds a number field takes. */
export interface NumberBounds {
  min?: number;
  max?: number;
}

/** Whether a number field's steppers can still move its value. */
export interface NumberStepperState {
  incrementDisabled: boolean;
  decrementDisabled: boolean;
}

export const BELOW_MIN_MESSAGE = "$dms.field_errors.too_small";
export const ABOVE_MAX_MESSAGE = "$dms.field_errors.too_large";

function isNumberValue(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * The error of a value outside its bounds, for a field that keeps what was
 * typed instead of clamping it; `undefined` when it is in range or empty.
 */
export function numberRangeError(
  value: unknown,
  bounds: NumberBounds,
): string | undefined {
  if (!isNumberValue(value)) return undefined;
  if (bounds.min !== undefined && value < bounds.min) return BELOW_MIN_MESSAGE;
  if (bounds.max !== undefined && value > bounds.max) return ABOVE_MAX_MESSAGE;
  return undefined;
}

/**
 * The steppers of a field that does not hand its bounds to the input: they
 * stop at the bounds the input no longer knows of.
 */
export function numberStepperState(
  value: unknown,
  bounds: NumberBounds,
): NumberStepperState {
  const current = isNumberValue(value) ? value : undefined;
  return {
    incrementDisabled:
      current !== undefined &&
      bounds.max !== undefined &&
      current >= bounds.max,
    decrementDisabled:
      current !== undefined &&
      bounds.min !== undefined &&
      current <= bounds.min,
  };
}
