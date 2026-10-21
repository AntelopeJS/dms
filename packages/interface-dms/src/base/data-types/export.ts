/**
 * What a data type writes an exported value with: the language, region and
 * clock of the reader who asked for the export, and the column's display.
 */
export interface DataTypeExportContext {
  /**
   * A display text in the reader's language: a `$` key translated, a literal
   * as is, an empty value as `""`.
   */
  translate(text: unknown): string;
  /** The locale dates and numbers are written in (`fr-FR`). */
  formatLocale: string;
  /** The IANA zone dates are written in. */
  timeZone: string;
  /** The reader's clock, the locale's when unset. */
  hourCycle?: "h23" | "h12";
  /** The column's display, when its table view declares one. */
  display?: { id?: string; options: Record<string, unknown> };
}

/** The labels a flag is written with when the column names none. */
export const EXPORT_YES_NO = {
  on: "$dms.table.filter.boolean.checked",
  off: "$dms.table.filter.boolean.unchecked",
} as const;

const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A date as a day, or a day and a time, in the reader's zone and clock. A
 * value that is no date is written as is.
 */
export function formatExportDate(
  value: unknown,
  context: DataTypeExportContext,
  withTime: boolean,
): string {
  const date = asDate(value);
  if (!date) {
    return typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
      ? String(value)
      : "";
  }
  const options: Intl.DateTimeFormatOptions = {
    ...DAY_FORMAT,
    timeZone: context.timeZone,
  };
  if (withTime) {
    Object.assign(options, TIME_FORMAT, { hourCycle: context.hourCycle });
  }
  return new Intl.DateTimeFormat(context.formatLocale, options).format(date);
}

/** A flag as one of two labels, translated. */
export function formatExportFlag(
  value: unknown,
  labels: { on?: unknown; off?: unknown },
  context: DataTypeExportContext,
): string {
  const label = value
    ? (labels.on ?? EXPORT_YES_NO.on)
    : (labels.off ?? EXPORT_YES_NO.off);
  return context.translate(label);
}

/** A related row by its label (`name` unless named), else its id. */
export function formatExportRelation(
  value: unknown,
  labelKey: string | undefined,
  context: DataTypeExportContext,
): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return context.translate(value);
  }
  const row = value as Record<string, unknown>;
  return context.translate(row[labelKey ?? "name"] ?? row._id);
}

/**
 * A value as an export writes it when its type words it no other way: a date
 * as a day and a time, a flag as Yes or No, an object by its `name`, `label`
 * or `_id`, anything else as stored.
 */
export function formatExportPlain(
  value: unknown,
  context: DataTypeExportContext,
): unknown {
  if (value instanceof Date) return formatExportDate(value, context, true);
  if (typeof value === "boolean") return formatExportFlag(value, {}, context);
  if (typeof value === "object" && value !== null) {
    const row = value as Record<string, unknown>;
    const label = row.name ?? row.label ?? row._id;
    return label === undefined || label === null || label === ""
      ? JSON.stringify(value)
      : context.translate(label);
  }
  return value;
}
