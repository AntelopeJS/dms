import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import {
  type ComposableText,
  isComposedText,
} from "../../../../../dms-core/app/utils/composedText";
import type { Tone } from "../../../types/tone";
import { DMS_TONE_TEXT, isDmsTone } from "../../utils/tone";

// What the cell data types share: reading a sibling field off the row, and
// the text tones a cell takes.

export type Row = Record<string, unknown> | undefined;

export const readRowField = (row: Row, field: string | undefined): unknown =>
  field && row ? get(row, field) : undefined;

/**
 * The `Tone` a row field holds (`toneField` of a display), or nothing when the
 * field is unset or holds no known tone.
 */
export const readRowTone = (
  row: Row,
  field: string | undefined,
): Tone | undefined => {
  const tone = readRowField(row, field);
  return typeof tone === "string" && isDmsTone(tone) ? tone : undefined;
};

/** The text colour of the row's tone, else `fallback` (the display's own). */
export const rowToneTextClass = (
  row: Row,
  field: string | undefined,
  fallback: string,
): string => {
  const tone = readRowTone(row, field);
  return tone ? DMS_TONE_TEXT[tone] : fallback;
};

export const stringOf = (value: unknown): string | undefined =>
  value === null || value === undefined || value === ""
    ? undefined
    : String(value);

/** Truthy the way a status reads it: a non-empty list, a set flag. */
export const isSet = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value !== "" && value !== "false";
  return Boolean(value);
};

// Text tones a cell data type can take, as literal classes for Tailwind.
const CELL_TONES: Record<string, string> = {
  default: "text-toned",
  toned: "text-toned",
  highlighted: "text-highlighted",
  muted: "text-muted",
  dimmed: "text-dimmed",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
  primary: "text-primary",
};
export const toneClass = (
  tone: string | undefined,
  fallback = "default",
): string => CELL_TONES[tone ?? fallback] ?? CELL_TONES[fallback]!;

/**
 * A cell's secondary line with its tone, as a row field holds it. Mirror of
 * `CellSubline` from `@antelopejs/interface-dms/base/table-view`.
 */
export interface CellSubline {
  text: BlockText;
  tone?: string;
}

/** A secondary line written in the reader's language, ready to draw. */
export interface ResolvedSubline {
  text: string;
  /** The row's own tone, when it gives one. */
  tone?: string;
}

/** How a display reads the row field of its secondary line. */
export interface SublineReading {
  processText: (text: ComposableText) => string;
  /**
   * Whether a bare string is a block text (`$`-prefixed for an i18n key)
   * rather than data drawn as written (an address under a name).
   */
  isStringTranslated: boolean;
}

const isCellSubline = (value: unknown): value is CellSubline =>
  typeof value === "object" &&
  value !== null &&
  "text" in value &&
  !isComposedText(value);

const toSubline = (text: string, tone?: string): ResolvedSubline | undefined =>
  text ? { text, tone } : undefined;

/**
 * The secondary line a row field holds — a string, a composed text, or a text
 * and its tone — or nothing for an empty field.
 */
export function readSubline(
  value: unknown,
  { processText, isStringTranslated }: SublineReading,
): ResolvedSubline | undefined {
  if (isCellSubline(value)) {
    return toSubline(processText(value.text), value.tone);
  }
  if (isComposedText(value)) return toSubline(processText(value));
  const plain = stringOf(value);
  if (!plain) return undefined;
  return toSubline(isStringTranslated ? processText(plain) : plain);
}
