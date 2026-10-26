import { get } from "@nuxt/ui/runtime/utils/index.js";

const PARAM_KEY = String.raw`params\.(\w+(?::\d+)?)`;

const QUERY_KEY = String.raw`query\.([\w.-]+)`;

const RESPONSE_KEY = String.raw`response\.([\w.-]+)`;

const tokenPattern = (key: string, flags = "g"): RegExp =>
  new RegExp(String.raw`\{\{\s*${key}\s*\}\}`, flags);

const PARAM_TOKEN = tokenPattern(PARAM_KEY);
const QUERY_TOKEN = tokenPattern(QUERY_KEY);
const RESPONSE_TOKEN = tokenPattern(RESPONSE_KEY);
const TOKEN_OPENING = "{{";

export interface ReplaceUrlVariablesContext {
  routeParams?: Record<string, string>;
  routeQuery: Record<string, unknown>;
  response?: Record<string, unknown>;
}

type EncodeValue = (value: string) => string;

/** How each kind of route value is written into the text. */
interface TokenEncoding {
  param: EncodeValue;
  query: EncodeValue;
}

const keepValue: EncodeValue = (value) => value;

const encodeParam: EncodeValue = (value) => {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
};

const URL_ENCODING: TokenEncoding = {
  param: encodeParam,
  query: encodeURIComponent,
};
const TEXT_ENCODING: TokenEncoding = { param: keepValue, query: keepValue };

function fillRouteTokens(
  text: string,
  context: ReplaceUrlVariablesContext,
  encoding: TokenEncoding,
): string {
  return text
    .replace(PARAM_TOKEN, (match, key) => {
      const value = context.routeParams?.[key];
      return value ? encoding.param(value) : match;
    })
    .replace(QUERY_TOKEN, (match, key) => {
      const value = context.routeQuery[key];
      return typeof value === "string" ? encoding.query(value) : match;
    });
}

function fillResponseTokens(
  text: string,
  response: Record<string, unknown> | undefined,
): string {
  if (!response) return text;
  return text.replace(RESPONSE_TOKEN, (match, key: string) => {
    const value: unknown = get(response, key);
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : match;
  });
}

/**
 * Fills the `{{params.X}}`, `{{query.X}}` and (with a response)
 * `{{response.X}}` tokens of a URL. Route values are percent-encoded, so a
 * value such as `GET /api/a?b=c` stays one query value or one path segment;
 * response values are written as answered. A token with no value is left as
 * written.
 */
export function replaceUrlVariables(
  url: string,
  context: ReplaceUrlVariablesContext,
): string {
  return fillResponseTokens(
    fillRouteTokens(url, context, URL_ENCODING),
    context.response,
  );
}

/** Whether a URL still names a token: written so, or left unresolved. */
export function hasUrlVariables(url: string): boolean {
  return url.includes(TOKEN_OPENING);
}

/**
 * The URL with its tokens filled, or `undefined` while one is left: a URL
 * naming a value the page does not carry is not a route, and must not be
 * requested as one.
 */
export function resolveUrlVariables(
  url: string | undefined,
  context: ReplaceUrlVariablesContext,
): string | undefined {
  if (!url) return undefined;
  const resolved = replaceUrlVariables(url, context);
  return hasUrlVariables(resolved) ? undefined : resolved;
}

/**
 * A plain value (not a URL) with its route tokens filled as they are, without
 * encoding, or `undefined` while one is left: a submit default such as
 * `{{query.status}}` is a field value.
 */
export function resolveTextVariables(
  text: string,
  context: ReplaceUrlVariablesContext,
): string | undefined {
  const resolved = fillRouteTokens(text, context, TEXT_ENCODING);
  return hasUrlVariables(resolved) ? undefined : resolved;
}

const ROUTE_KEY = `(?:${PARAM_KEY}|${QUERY_KEY})`;
const UNRESOLVED_ROUTE_TOKEN = tokenPattern(ROUTE_KEY);
const UNRESOLVED_ROUTE_VALUE = new RegExp(
  `^${tokenPattern(ROUTE_KEY, "").source}$`,
);

/**
 * Whether a text names a value of the page (`{{params.X}}`, `{{query.X}}`):
 * the route is only read for one that does.
 */
export function namesPageValue(text: string): boolean {
  return new RegExp(UNRESOLVED_ROUTE_TOKEN.source).test(text);
}

const QUERY_SEPARATOR = "?";
const FRAGMENT_SEPARATOR = "#";
const PAIR_SEPARATOR = "&";
const VALUE_SEPARATOR = "=";

/** The query of a URL without the pairs whose whole value matches `value`. */
function dropPairs(search: string, value: RegExp): string {
  return search
    .split(PAIR_SEPARATOR)
    .filter((pair) => {
      const pairValue = pair.slice(pair.indexOf(VALUE_SEPARATOR) + 1);
      return !pair.includes(VALUE_SEPARATOR) || !value.test(pairValue);
    })
    .join(PAIR_SEPARATOR);
}

/**
 * A URL without its `token`s: a query pair whose whole value is one (`value`)
 * is left out, any other is left empty.
 */
function stripTokens(url: string, token: RegExp, value: RegExp): string {
  const [beforeFragment = "", ...fragment] = url.split(FRAGMENT_SEPARATOR);
  const [path = "", ...search] = beforeFragment.split(QUERY_SEPARATOR);
  const query = dropPairs(search.join(QUERY_SEPARATOR), value);
  const rebuilt = [
    query ? `${path}${QUERY_SEPARATOR}${query}` : path,
    ...fragment,
  ].join(FRAGMENT_SEPARATOR);
  return rebuilt.replace(token, "");
}

/**
 * A link's URL with the `{{params.X}}` / `{{query.X}}` tokens of the page it
 * sits on filled, for a button that always leads somewhere: a query pair
 * whose value is a token the page has no value for is left out
 * (`?workspace={{query.workspace}}` on a page without `?workspace=` leads to
 * the target's default), any other such token is left empty.
 */
export function resolveLinkVariables(
  url: string,
  context: ReplaceUrlVariablesContext,
): string {
  const filled = replaceUrlVariables(url, context);
  if (!hasUrlVariables(filled)) return filled;
  return stripTokens(filled, UNRESOLVED_ROUTE_TOKEN, UNRESOLVED_ROUTE_VALUE);
}

const ROW_KEY = String.raw`row\.[^{}\s]+`;
const ROW_TOKEN = tokenPattern(ROW_KEY);
const ROW_VALUE = new RegExp(`^${tokenPattern(ROW_KEY, "").source}$`);

/**
 * A URL sent without a row (a bulk action on the selection bar) with its
 * `{{row.X}}` tokens taken out as a link's unresolved page tokens are: a query
 * pair whose whole value is one is left out (`?ids={{row._id}}` gives way to
 * the selection's `ids`), any other is left empty.
 */
export function dropRowTokens(url: string): string {
  if (!new RegExp(ROW_TOKEN.source).test(url)) return url;
  return stripTokens(url, ROW_TOKEN, ROW_VALUE);
}
