import { get } from "@nuxt/ui/runtime/utils/index.js";

// A row field is named `{{row.<field>}}` (a dotted path reaching into it), as
// the page's values are `{{params.X}}` / `{{query.X}}`, filled elsewhere.
const ROW_TOKEN = /\{\{\s*row\.([^{}\s]+)\s*\}\}/g;
// A template that is one row token and nothing else takes a whole URL from the
// row (`{{row.invoiceUrl}}`): encoding it would turn its `/` and `?` into
// `%2F` and `%3F`, leaving no URL to open.
const WHOLE_ROW_TOKEN = new RegExp(`^\\s*${ROW_TOKEN.source}\\s*$`);

/** Whether a template names a field of a row (`{{row.X}}`). */
export const namesRowField = (template: string): boolean =>
  new RegExp(ROW_TOKEN.source).test(template);

const rowValue = (data: Record<string, unknown>, key: string): string => {
  const value: unknown = get(data, key);
  return value === undefined || value === null ? "" : String(value);
};

// A colon is a valid path character (RFC 3986 pchar) and the API router
// matches path parameters without decoding them: tenant-scoped ids
// ("default:<uuid>") must reach a `/:id/...` route as they are.
const ENCODED_COLON = /%3A/gi;

const SCHEME_PATTERN = /^\s*([a-z][a-z0-9+.-]*):/i;
const SAFE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
const REFUSED_URL = "";

// The colon survives the encoding, so a template starting with a field
// (`{{row.website}}`) takes its scheme from row data: `javascript:` must not reach
// a link or `location.href`.
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
