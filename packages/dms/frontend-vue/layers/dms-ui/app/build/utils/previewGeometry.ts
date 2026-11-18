import type { JsonValue } from "../../../../dms-core/app/types/json";
import {
  isNumber,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import { isObjectValue } from "./json";

/** A box in the preview's document, in CSS pixels from its top-left corner. */
export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a text is drawn, so an input laid over it reads the same. */
export interface PreviewFont {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  color: string;
  align: string;
}

function isFiniteNumber(value: JsonValue | undefined): value is number {
  return isNumber(value) && Number.isFinite(value);
}

/** The box a posted message carries, or undefined when it is not one. */
export function parseRect(value: JsonValue | undefined): PreviewRect | undefined {
  if (!isObjectValue(value)) return undefined;
  const { x, y, width, height } = value;
  return isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height)
    ? { x, y, width, height }
    : undefined;
}

/** The text style a posted message carries, or undefined when it is not one. */
export function parseFont(value: JsonValue | undefined): PreviewFont | undefined {
  if (!isObjectValue(value)) return undefined;
  const { family, size, weight, lineHeight, letterSpacing, color, align } =
    value;
  return isString(family) &&
    isString(size) &&
    isString(weight) &&
    isString(lineHeight) &&
    isString(letterSpacing) &&
    isString(color) &&
    isString(align)
    ? { family, size, weight, lineHeight, letterSpacing, color, align }
    : undefined;
}
