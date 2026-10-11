// `{{params.id}}` takes the bare name, which on a route repeating a placeholder
// is its last occurrence — the row id of a form page. The `:<n>` suffix reaches
// a specific occurrence, `{{params.id:1}}` being the id of the page carrying the
// table view (see extractRouteParams).
const PARAM_TOKEN = /\{\{params\.(\w+(?::\d+)?)\}\}/g;
const QUERY_TOKEN = /\{\{query\.(\w+)\}\}/g;
const RESPONSE_TOKEN = /\{\{response\.(\w+)\}\}/g;
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

// A route parameter is a segment of the page path, which the router keeps
// percent-encoded: it is decoded first so that it is not encoded twice.
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

// Written as answered: a response may hand back a whole path to open next
// (`redirectOnSuccess: "{{response.redirectPath}}"`), which encoding would break.
function fillResponseTokens(
  text: string,
  response: Record<string, unknown> | undefined,
): string {
  if (!response) return text;
  return text.replace(RESPONSE_TOKEN, (match, key) => {
    const value = response[key];
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

// A route token left without a value: `{{params.id}}`, `{{query.workspace}}`.
const UNRESOLVED_ROUTE_TOKEN = /\{\{(?:params|query)\.\w+(?::\d+)?\}\}/g;
const UNRESOLVED_ROUTE_VALUE = /^\{\{(?:params|query)\.\w+(?::\d+)?\}\}$/;
const QUERY_SEPARATOR = "?";
const FRAGMENT_SEPARATOR = "#";
const PAIR_SEPARATOR = "&";
const VALUE_SEPARATOR = "=";

/** The query of a URL without the pairs whose whole value is a token left empty. */
function dropUnresolvedPairs(search: string): string {
  return search
    .split(PAIR_SEPARATOR)
    .filter((pair) => {
      const value = pair.slice(pair.indexOf(VALUE_SEPARATOR) + 1);
      return (
        !pair.includes(VALUE_SEPARATOR) || !UNRESOLVED_ROUTE_VALUE.test(value)
      );
    })
    .join(PAIR_SEPARATOR);
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
  const [beforeFragment = "", ...fragment] = filled.split(FRAGMENT_SEPARATOR);
  const [path = "", ...search] = beforeFragment.split(QUERY_SEPARATOR);
  const query = dropUnresolvedPairs(search.join(QUERY_SEPARATOR));
  const rebuilt = [
    query ? `${path}${QUERY_SEPARATOR}${query}` : path,
    ...fragment,
  ].join(FRAGMENT_SEPARATOR);
  return rebuilt.replace(UNRESOLVED_ROUTE_TOKEN, "");
}
