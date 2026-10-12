import type {
  InputNumberAdjustment,
  InputNumberAdjustmentReason,
} from "../../types/input-number";

/** The bounds a number field keeps its value within. */
export interface NumberFieldBounds {
  min?: number;
  max?: number;
}

// 11111.1 writes both the group and the decimal separator in every locale.
const SEPARATOR_SAMPLE = 11111.1;
const WHITESPACE = /\s/g;
const NOT_NUMERIC = /[^\d.+-]/g;

function separatorsOf(locale: string): { group?: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(SEPARATOR_SAMPLE);
  return {
    group: parts.find((part) => part.type === "group")?.value,
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
}

/**
 * A number as typed in a field written in `locale` ("1,020", "1 020,5"):
 * `null` when nothing is typed or it does not read as a number.
 */
export function parseTypedNumber(text: string, locale: string): number | null {
  const { group, decimal } = separatorsOf(locale);
  let digits = text.replace(WHITESPACE, "");
  if (group && group.trim()) digits = digits.split(group).join("");
  digits = digits.split(decimal).join(".").replace(NOT_NUMERIC, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function reasonOf(
  typed: number,
  bounds: NumberFieldBounds,
): InputNumberAdjustmentReason {
  if (bounds.max !== undefined && typed > bounds.max) return "max";
  if (bounds.min !== undefined && typed < bounds.min) return "min";
  return "step";
}

/**
 * How a number field changed what was typed into the value it keeps: kept
 * within its bounds, or put on its steps. `null` when it keeps what was typed.
 */
export function numberAdjustment(
  typed: number | null,
  value: number | null | undefined,
  bounds: NumberFieldBounds,
): InputNumberAdjustment | null {
  if (typed === null || typeof value !== "number" || value === typed)
    return null;
  return { typed, value, reason: reasonOf(typed, bounds) };
}
