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
