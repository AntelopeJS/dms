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

/**
 * Fills the `{{params.X}}`, `{{query.X}}` and (with a response)
 * `{{response.X}}` tokens of a URL. A token with no value is left as written.
 */
export function replaceUrlVariables(
  url: string,
  context: ReplaceUrlVariablesContext,
): string {
  let processedUrl = url.replace(
    PARAM_TOKEN,
    (match, key) => context.routeParams?.[key] || match,
  );

  processedUrl = processedUrl.replace(QUERY_TOKEN, (match, key) => {
    const value = context.routeQuery[key];
    return typeof value === "string" ? value : match;
  });

  if (context.response) {
    processedUrl = processedUrl.replace(RESPONSE_TOKEN, (match, key) => {
      const value = context.response?.[key];
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : match;
    });
  }

  return processedUrl;
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
