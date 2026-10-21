import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  type DataTypeExportContext,
  formatExportPlain,
} from "@antelopejs/interface-dms/base/data-types";
import type {
  ColumnOptions,
  TableViewExportValues,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { getColumnDisplayId } from "@antelopejs/interface-dms/base/table-view/internal/column-display";
import { GetLocaleMessages } from "@antelopejs/interface-dms/html-render";

/** A catalog of texts: nested message objects, strings at the leaves. */
type LocaleMessages = Record<string, unknown>;

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
const TRANSLATION_KEY_PREFIX = "$";
const PLURAL_SEPARATOR = "|";
// vue-i18n's literal interpolation, `{'@'}`, written as its content.
const LITERAL_INTERPOLATION = /\{'([^']*)'\}/g;
const LIST_SEPARATOR = ", ";
/** The language every catalog falls back to, as the frontend's i18n does. */
const FALLBACK_MESSAGE_LANGUAGE = "en";

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

/** The message at a dotted key path, when it is a text. */
function lookupMessage(
  messages: LocaleMessages,
  key: string,
): string | undefined {
  let node: unknown = messages;
  for (const segment of key.split(".")) {
    if (!isRow(node)) return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

/** What the column's data type words a value with (`DataType.exportValue`). */
function exportContextOf(
  column: ColumnOptions | undefined,
  locale: ExportLocale,
): DataTypeExportContext {
  return {
    translate: (text) => translateText(text, locale),
    formatLocale: locale.formatLocale,
    timeZone: locale.timeZone,
    hourCycle: locale.hourCycle,
    display: column?.display && {
      id: getColumnDisplayId(column.display),
      options: (column.display.options ?? {}) as Row,
    },
  };
}

/** A cell of the export: empty for no value, a list joined by commas. */
export function formatExportCell(
  value: unknown,
  column: ColumnOptions | undefined,
  locale: ExportLocale,
): unknown {
  if (isEmpty(value)) return "";
  const context = exportContextOf(column, locale);
  const format = (entry: unknown) =>
    column
      ? column.type.exportValue(entry, context)
      : formatExportPlain(entry, context);
  const formatOne = (entry: unknown) => (isEmpty(entry) ? "" : format(entry));
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
  return column.type.exportHeader(
    translateText(column.name ?? key, locale) || key,
  );
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
 * The browser's time zone, which `$authFetch` sends on every request and the
 * frontend server relays (`@antelopejs/dms-frontend`, `CLIENT_HEADERS`).
 */
const TIME_ZONE_HEADER = "x-time-zone";
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
 * browser's the request names (`x-time-zone`) otherwise, UTC last.
 */
export function exportTimeZone(
  ctx: RequestContext | undefined,
  user: User | undefined,
): string {
  return (
    knownTimeZone(user?.timeZone) ??
    knownTimeZone(headerValue(ctx, TIME_ZONE_HEADER)) ??
    DEFAULT_TIME_ZONE
  );
}

/**
 * The locale of the user who asked for an export, its catalogs read once from
 * the frontend that renders the pages (`GetLocaleMessages`).
 */
export async function resolveExportLocale(
  ctx: RequestContext | undefined,
  user: User | undefined,
): Promise<ExportLocale> {
  const language = exportLanguage(ctx, user);
  const catalogs = await GetLocaleMessages(language);
  const hourCycle = user?.timeFormat;
  return {
    messages: catalogs.messages,
    fallbackMessages: catalogs.fallback,
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
export async function readableExportColumns(
  tableViewMetadata: TableViewMeta | undefined,
  fields: string[],
  ctx: RequestContext | undefined,
  user: User | undefined,
): Promise<ReadableColumn[] | undefined> {
  if (tableViewMetadata?.options?.exportValues === RAW_EXPORT_VALUES) {
    return undefined;
  }
  return readableColumns(
    fields,
    tableViewMetadata?.columns ?? {},
    await resolveExportLocale(ctx, user),
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
