import { get } from "@nuxt/ui/runtime/utils/index.js";

const VARIABLE_PATTERN = /{([^}]+)}/g;
// A colon is a valid path character (RFC 3986 pchar) and the API router
// matches path parameters without decoding them: tenant-scoped ids
// ("default:<uuid>") must reach a `/:id/...` route as they are.
const ENCODED_COLON = /%3A/gi;

export const interpolateUrl = (
  url: string,
  data: Record<string, unknown>,
): string => {
  return url.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = get(data, key);
    if (value === undefined || value === null) {
      return "";
    }
    return encodeURIComponent(String(value)).replace(ENCODED_COLON, ":");
  });
};
