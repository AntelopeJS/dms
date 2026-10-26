import { get } from "@nuxt/ui/runtime/utils/index.js";

const ROW_TOKEN = /\{\{\s*row\.([^{}\s]+)\s*\}\}/g;

const WHOLE_ROW_TOKEN = new RegExp(`^\\s*${ROW_TOKEN.source}\\s*$`);

/** Whether a template names a field of a row (`{{row.X}}`). */
export const namesRowField = (template: string): boolean =>
  new RegExp(ROW_TOKEN.source).test(template);

const RELATED_ROW_ID_KEYS = ["_id", "id"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

const relatedRowId = (value: Record<string, unknown>): unknown =>
  RELATED_ROW_ID_KEYS.map((key) => value[key]).find(
    (id) => id !== undefined && id !== null,
  );

const scalarOf = (value: unknown): unknown =>
  isPlainObject(value) ? relatedRowId(value) : value;

const rowValue = (data: Record<string, unknown>, key: string): string => {
  const field: unknown = get(data, key);
  const value = Array.isArray(field) ? field.map(scalarOf) : scalarOf(field);
  return value === undefined || value === null ? "" : String(value);
};

const ENCODED_COLON = /%3A/gi;

const SCHEME_PATTERN = /^\s*([a-z][a-z0-9+.-]*):/i;
const SAFE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
const REFUSED_URL = "";

function hasSafeScheme(url: string): boolean {
  const scheme = SCHEME_PATTERN.exec(url)?.[1];
  return scheme === undefined || SAFE_SCHEMES.has(scheme.toLowerCase());
}

const fillRowTokens = (url: string, data: Record<string, unknown>): string => {
  const wholeKey = WHOLE_ROW_TOKEN.exec(url)?.[1];
  if (wholeKey !== undefined) return rowValue(data, wholeKey);
  return url.replace(ROW_TOKEN, (_, key: string) =>
    encodeURIComponent(rowValue(data, key)).replace(ENCODED_COLON, ":"),
  );
};

/**
 * Fills the `{{row.field}}` tokens of a URL template with encoded row values,
 * a field the row lacks left empty. A template that is a single token takes
 * the field as the whole URL, unencoded. A result with a scheme other than
 * http, https or mailto comes back empty.
 */
export const interpolateUrl = (
  url: string,
  data: Record<string, unknown>,
): string => {
  const interpolated = fillRowTokens(url, data);
  return hasSafeScheme(interpolated) ? interpolated : REFUSED_URL;
};

/**
 * Fills the `{{row.field}}` tokens of a plain value (a file name) with the
 * row's values as they are, a field the row lacks left empty.
 */
export const interpolateRowText = (
  text: string,
  data: Record<string, unknown>,
): string => text.replace(ROW_TOKEN, (_, key: string) => rowValue(data, key));
