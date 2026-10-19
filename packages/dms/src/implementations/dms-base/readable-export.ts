import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getDataTypeId } from "@antelopejs/interface-dms/base/data-types";
import type {
  ColumnOptions,
  TableViewExportValues,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { getColumnDisplayId } from "@antelopejs/interface-dms/base/table-view/internal/column-display";
import {
  FALLBACK_MESSAGE_LANGUAGE,
  type LocaleMessages,
  lookupMessage,
  readLocaleMessages,
} from "../dms/locale-messages";

/** What a readable export is worded in: the language and region of its reader. */
export interface ExportLocale {
  /** The catalog of the reader's language. */
  messages: LocaleMessages;
  /** The catalog a missing message falls back to (English). */
  fallbackMessages: LocaleMessages;
  /** The locale dates and percentages are written in (`fr-FR`). */
  formatLocale: string;
  /** The IANA zone dates are written in. */
  timeZone: string;
  /** The reader's clock, the locale's when unset. */
  hourCycle?: "h23" | "h12";
}

/** One column of a readable export: its field, its header, its wording. */
export interface ReadableColumn {
  key: string;
  header: string;
  format: (value: unknown) => unknown;
}

type Row = Record<string, unknown>;
type CellFormatter = (
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
) => unknown;

const TRANSLATION_KEY_PREFIX = "$";
const PLURAL_SEPARATOR = "|";
// vue-i18n's literal interpolation, `{'@'}`, written as its content.
const LITERAL_INTERPOLATION = /\{'([^']*)'\}/g;
const LIST_SEPARATOR = ", ";
const RANGE_SEPARATOR = " – ";
const DEFAULT_RELATION_LABEL_KEY = "name";
const RELATIVE_DATE_DISPLAY = "relative_date";
const INDICATOR_DISPLAY = "indicator";
const DAY_STYLE = "day";
const BOOLEAN_LABELS = {
  on: "$dms.table.filter.boolean.checked",
  off: "$dms.table.filter.boolean.unchecked",
};
const STATUS_LABELS = {
  on: "$common.status.online",
  off: "$common.status.offline",
};
/**
 * The currency the grid writes a price in: `PriceType` carries none, and the
 * frontend formats every price in euros.
 */
export const EXPORT_PRICE_CURRENCY = "EUR";
const PERCENT_FRACTION_DIGITS = 1;
const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * A display text as the grid shows it: a `$` key in the reader's language (its
 * first plural form, the bare key when no catalog has it), a literal as is.
 */
export function translateText(text: unknown, locale: ExportLocale): string {
  if (typeof text !== "string") return isEmpty(text) ? "" : String(text);
  if (!text.startsWith(TRANSLATION_KEY_PREFIX)) return text;
  const key = text.slice(TRANSLATION_KEY_PREFIX.length);
  const message =
    lookupMessage(locale.messages, key) ??
    lookupMessage(locale.fallbackMessages, key);
  if (message === undefined) return key;
  return message
    .split(PLURAL_SEPARATOR)[0]!
    .replace(LITERAL_INTERPOLATION, "$1")
    .trim();
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** A date as a day, or a day and a time, in the reader's zone and clock. */
export function formatExportDate(
  value: unknown,
  locale: ExportLocale,
  withTime: boolean,
): string {
  const date = asDate(value);
  if (!date) return isEmpty(value) ? "" : String(value);
  const options: Intl.DateTimeFormatOptions = {
    ...DAY_FORMAT,
    timeZone: locale.timeZone,
  };
  if (withTime) {
    Object.assign(options, TIME_FORMAT, { hourCycle: locale.hourCycle });
  }
  return new Intl.DateTimeFormat(locale.formatLocale, options).format(date);
}

function displayOptions(column: ColumnOptions): Row {
  return (column.display?.options ?? {}) as Row;
}

function displayId(column: ColumnOptions): string | undefined {
  return column.display ? getColumnDisplayId(column.display) : undefined;
}

// A date the grid draws to the minute: a relative date not styled by the day
// (a ticket opened, a device last seen). Any other date reads as a day.
function drawsTime(column: ColumnOptions): boolean {
  if (displayId(column) !== RELATIVE_DATE_DISPLAY) return false;
  const options = displayOptions(column);
  return options.style !== DAY_STYLE && options.pastStyle !== DAY_STYLE;
}

function formatDateValue(
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
): string {
  const withTime = drawsTime(column);
  if (isRow(value) && ("start" in value || "end" in value)) {
    return [value.start, value.end]
      .map((bound) => formatExportDate(bound, locale, withTime))
      .join(RANGE_SEPARATOR);
  }
  return formatExportDate(value, locale, withTime);
}

function typeOptions(column: ColumnOptions): Row {
  return (column.type.options ?? {}) as Row;
}

function formatSelect(
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
): string {
  const items = (typeOptions(column).items ?? []) as Row[];
  // A query or a form may hand a numeric option its value as text.
  const item = items.find(
    (candidate) => String(candidate.value) === String(value),
  );
  return translateText(item?.label ?? value, locale);
}

// The join resolved the related row; a relation left unjoined (`filterOnly`)
// or pointing at a deleted row keeps its id.
function formatRelation(
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
): string {
  if (!isRow(value)) return translateText(value, locale);
  const keyMapping = (typeOptions(column).keyMapping ?? {}) as Row;
  const labelKey =
    typeof keyMapping.label === "string"
      ? keyMapping.label
      : DEFAULT_RELATION_LABEL_KEY;
  return translateText(value[labelKey] ?? value._id, locale);
}

function onOffLabel(
  value: unknown,
  labels: { on?: unknown; off?: unknown },
  defaults: { on: string; off: string },
  locale: ExportLocale,
): string {
  const label = value
    ? (labels.on ?? defaults.on)
    : (labels.off ?? defaults.off);
  return translateText(label, locale);
}

// A switch reads as the grid words it: an indicator's own labels, Yes or No
// otherwise.
function formatBoolean(
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
): string {
  const options =
    displayId(column) === INDICATOR_DISPLAY ? displayOptions(column) : {};
  return onOffLabel(
    value,
    { on: options.onLabel, off: options.offLabel },
    BOOLEAN_LABELS,
    locale,
  );
}

function formatStatus(
  value: unknown,
  column: ColumnOptions,
  locale: ExportLocale,
): string {
  const options = typeOptions(column);
  return onOffLabel(
    value,
    { on: options.onlineLabel, off: options.offlineLabel },
    STATUS_LABELS,
    locale,
  );
}

function formatPercentage(
  value: unknown,
  _column: ColumnOptions,
  locale: ExportLocale,
): unknown {
  if (typeof value !== "number") return value;
  return new Intl.NumberFormat(locale.formatLocale, {
    style: "percent",
    maximumFractionDigits: PERCENT_FRACTION_DIGITS,
  }).format(value);
}

const ADDRESS_PARTS: string[][] = [
  ["streetName", "houseNumber", "boxNumber"],
  ["addressLine2"],
  ["postalCode", "city"],
  ["countrySubdivision"],
  ["countryCode"],
];

function formatAddress(value: unknown): unknown {
  if (!isRow(value)) return value;
  return ADDRESS_PARTS.map((part) =>
    part
      .map((key) => value[key])
      .filter((entry) => !isEmpty(entry))
      .join(" "),
  )
    .filter(Boolean)
    .join(LIST_SEPARATOR);
}

// A value the export has no rule for: a date as a day and a time, a flag as
// Yes or No, an object by its name; anything else as stored.
function formatPlain(
  value: unknown,
  _column: ColumnOptions | undefined,
  locale: ExportLocale,
): unknown {
  if (value instanceof Date) return formatExportDate(value, locale, true);
  if (typeof value === "boolean") {
    return onOffLabel(value, {}, BOOLEAN_LABELS, locale);
  }
  if (isRow(value)) {
    const label = value.name ?? value.label ?? value._id;
    return isEmpty(label)
      ? JSON.stringify(value)
      : translateText(label, locale);
  }
  return value;
}

// Numbers and prices stay numbers, so a spreadsheet can sum the column.
const CELL_FORMATTERS: Record<string, CellFormatter> = {
  select: formatSelect,
  relation: formatRelation,
  cascader_relation: formatRelation,
  date: formatDateValue,
  boolean: formatBoolean,
  status: formatStatus,
  percentage: formatPercentage,
  number: (value) => value,
  price: (value) => value,
  address: formatAddress,
};

function formatterOf(column: ColumnOptions | undefined): CellFormatter {
  const typeId = column ? getDataTypeId(column.type) : undefined;
  return (typeId && CELL_FORMATTERS[typeId]) || formatPlain;
}

/** A cell of the export: empty for no value, a list joined by commas. */
export function formatExportCell(
  value: unknown,
  column: ColumnOptions | undefined,
  locale: ExportLocale,
): unknown {
  if (isEmpty(value)) return "";
  const format = formatterOf(column);
  const formatOne = (entry: unknown) =>
    isEmpty(entry) ? "" : format(entry, column as ColumnOptions, locale);
  if (Array.isArray(value)) {
    return value
      .map(formatOne)
      .filter((entry) => !isEmpty(entry))
      .join(LIST_SEPARATOR);
  }
  return formatOne(value);
}

function headerOf(
  key: string,
  column: ColumnOptions | undefined,
  locale: ExportLocale,
): string {
  if (!column) return key;
  const name = translateText(column.name ?? key, locale) || key;
  return getDataTypeId(column.type) === "price"
    ? `${name} (${EXPORT_PRICE_CURRENCY})`
    : name;
}

/**
 * The exported fields as readable columns, in their export order: a field the
 * table view declares no column for keeps its key as its header.
 */
export function readableColumns(
  fields: string[],
  columns: Record<string, ColumnOptions>,
  locale: ExportLocale,
): ReadableColumn[] {
  return fields.map((key) => {
    const column = columns[key];
    return {
      key,
      header: headerOf(key, column, locale),
      format: (value) => formatExportCell(value, column, locale),
    };
  });
}

/** The header the frontend names its interface language in. */
const CONTENT_LANGUAGE_HEADER = "x-content-language";
const LANGUAGE_CODE_LENGTH = 2;
/**
 * The region of the DMS's texts per language (`core-en-GB.json`,
 * `core-fr-FR.json`), which dates are written in, as `formatLocale` is on
 * the frontend.
 */
const TEXT_LOCALES: Record<string, string> = { en: "en-GB", fr: "fr-FR" };
/**
 * The query parameter the frontend names the browser's time zone in on an
 * export. Not a header: the frontend server relays a fixed set of request
 * headers to the backend, and a custom one never reached it.
 */
const TIME_ZONE_PARAMETER = "timeZone";
/** The zone of a reader who chose none and whose browser named none. */
const DEFAULT_TIME_ZONE = "UTC";
const HOUR_CYCLES = new Set(["h23", "h12"]);

function headerValue(ctx: RequestContext | undefined, name: string) {
  const value = ctx?.rawRequest?.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The language an export is written in: the interface language the request
 * names (`x-content-language`), the user's language otherwise, English last.
 */
export function exportLanguage(
  ctx: RequestContext | undefined,
  user: User | undefined,
): string {
  const language = headerValue(ctx, CONTENT_LANGUAGE_HEADER) || user?.language;
  const code = language?.slice(0, LANGUAGE_CODE_LENGTH).toLowerCase();
  return code && /^[a-z]{2}$/.test(code) ? code : FALLBACK_MESSAGE_LANGUAGE;
}

function knownTimeZone(timeZone: unknown): string | undefined {
  if (typeof timeZone !== "string" || timeZone === "") return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The zone an export writes dates in: the user's saved time zone, the
 * browser's the request names (`?timeZone=`) otherwise, UTC last.
 */
export function exportTimeZone(
  ctx: RequestContext | undefined,
  user: User | undefined,
): string {
  return (
    knownTimeZone(user?.timeZone) ??
    knownTimeZone(ctx?.url?.searchParams.get(TIME_ZONE_PARAMETER)) ??
    DEFAULT_TIME_ZONE
  );
}

/** The locale of the user who asked for an export, its catalogs read once. */
export function resolveExportLocale(
  ctx: RequestContext | undefined,
  user: User | undefined,
): ExportLocale {
  const language = exportLanguage(ctx, user);
  const fallbackMessages = readLocaleMessages(FALLBACK_MESSAGE_LANGUAGE);
  const hourCycle = user?.timeFormat;
  return {
    messages:
      language === FALLBACK_MESSAGE_LANGUAGE
        ? fallbackMessages
        : readLocaleMessages(language),
    fallbackMessages,
    formatLocale: TEXT_LOCALES[language] ?? language,
    timeZone: exportTimeZone(ctx, user),
    hourCycle:
      hourCycle && HOUR_CYCLES.has(hourCycle)
        ? (hourCycle as ExportLocale["hourCycle"])
        : undefined,
  };
}

const RAW_EXPORT_VALUES: TableViewExportValues = "raw";

/**
 * The readable wording of an export's fields, or none when its table view
 * asks for the stored values (`exportValues: "raw"`).
 */
export function readableExportColumns(
  tableViewMetadata: TableViewMeta | undefined,
  fields: string[],
  ctx: RequestContext | undefined,
  user: User | undefined,
): ReadableColumn[] | undefined {
  if (tableViewMetadata?.options?.exportValues === RAW_EXPORT_VALUES) {
    return undefined;
  }
  return readableColumns(
    fields,
    tableViewMetadata?.columns ?? {},
    resolveExportLocale(ctx, user),
  );
}

/** A record as the export writes it: each field worded by its column. */
export function readableRow(
  columns: ReadableColumn[],
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    columns.map((column) => [column.key, column.format(record[column.key])]),
  );
}

/** The fields whose `@Joined` values a readable export page looks up. */
export function joinedExportFields(
  deferredJoined: Set<string> | undefined,
  pluck: Set<string> | undefined,
): Set<string> | undefined {
  // An id selection is not built by `Query.List` and defers nothing: each
  // joined field it exports is looked up per page.
  if (!deferredJoined) return pluck;
  return new Set(
    [...deferredJoined].filter((field) => !pluck || pluck.has(field)),
  );
}
