/**
 * How wide a single-line input sits in its row: `"compact"` for a short
 * value, `"full"` to fill the row. Left out, the input's bounds decide.
 */
export type InputWidth = "compact" | "full";

/** The widest number, in digits, a number input sizes compact by itself. */
const COMPACT_NUMBER_DIGITS = 6;
/** The longest `maxLength` a text input sizes compact by itself. */
const COMPACT_TEXT_LENGTH = 16;

interface NumberWidthOptions {
  width?: InputWidth;
  min?: number;
  max?: number;
}

interface TextWidthOptions {
  width?: InputWidth;
  maxLength?: number;
}

function integerDigits(value: number): number {
  return String(Math.trunc(Math.abs(value))).length;
}

/**
 * Whether a number input takes a compact width: asked for, or left out with
 * a `max` (and `min`) that keep the value within a few digits. Without a
 * `max` nothing bounds the value, so it fills the row.
 */
export function isCompactNumberInput({
  width,
  min,
  max,
}: NumberWidthOptions): boolean {
  if (width) return width === "compact";
  if (max === undefined || !Number.isFinite(max)) return false;
  const bounds = min === undefined ? [max] : [min, max];
  return Math.max(...bounds.map(integerDigits)) <= COMPACT_NUMBER_DIGITS;
}

/**
 * Whether a text input takes a compact width: asked for, or left out with a
 * `maxLength` short enough for a code or an abbreviation.
 */
export function isCompactTextInput({
  width,
  maxLength,
}: TextWidthOptions): boolean {
  if (width) return width === "compact";
  return maxLength !== undefined && maxLength <= COMPACT_TEXT_LENGTH;
}
