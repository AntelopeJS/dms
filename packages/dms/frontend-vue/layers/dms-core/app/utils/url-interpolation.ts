import { get } from "@nuxt/ui/runtime/utils/index.js";

const VARIABLE_PATTERN = /{([^}]+)}/g;

export const interpolateUrl = (
  url: string,
  data: Record<string, unknown>,
): string => {
  return url.replace(VARIABLE_PATTERN, (_, key: string) => {
    const value = get(data, key);
    if (value === undefined || value === null) {
      return "";
    }
    return encodeURIComponent(String(value));
  });
};
