import { get } from "@nuxt/ui/runtime/utils/index.js";

// What the cell data types share: reading a sibling field off the row, and
// the text tones a cell takes.

export type Row = Record<string, unknown> | undefined;

export const readRowField = (row: Row, field: string | undefined): unknown =>
  field && row ? get(row, field) : undefined;

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
