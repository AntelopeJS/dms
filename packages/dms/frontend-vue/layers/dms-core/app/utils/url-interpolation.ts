import { get } from "@nuxt/ui/runtime/utils/index.js";

const VARIABLE_PATTERN = /{([^}]+)}/g;
// A colon is a valid path character (RFC 3986 pchar) and the API router
// matches path parameters without decoding them: tenant-scoped ids
// ("default:<uuid>") must reach a `/:id/...` route as they are.
const ENCODED_COLON = /%3A/gi;

const SCHEME_PATTERN = /^\s*([a-z][a-z0-9+.-]*):/i;
const SAFE_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
const REFUSED_URL = "";

// The colon survives the encoding, so a template starting with a field
// (`{website}`) takes its scheme from row data: `javascript:` must not reach
// a link or `location.href`.
function hasSafeScheme(url: string): boolean {
  const scheme = SCHEME_PATTERN.exec(url)?.[1];
  return scheme === undefined || SAFE_SCHEMES.has(scheme.toLowerCase());
}

/**
 * Fills `{field}` placeholders of a URL template with encoded row values. A
 * result with a scheme other than http, https or mailto comes back empty.
 */
export const interpolateUrl = (
  url: string,
  data: Record<string, unknown>,
): string => {
  const interpolated = url.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = get(data, key);
    if (value === undefined || value === null) {
      return "";
    }
    return encodeURIComponent(String(value)).replace(ENCODED_COLON, ":");
  });
  return hasSafeScheme(interpolated) ? interpolated : REFUSED_URL;
};
