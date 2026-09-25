import type { ColorModePreference } from "./types";

export const COLOR_MODE_COOKIE = "dms-color-mode";
const COLOR_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_COLOR_MODE_PREFERENCE: ColorModePreference = "system";

/**
 * The user's color mode as a cookie ref shared by every caller: assign it to
 * change the theme. The server reads the same cookie, so an explicit `light`
 * or `dark` is already in the rendered HTML; `system` resolves in the browser.
 */
export const useColorModePreference = () => {
  return useDmsCookie<ColorModePreference>(COLOR_MODE_COOKIE, {
    default: () => DEFAULT_COLOR_MODE_PREFERENCE,
    maxAge: COLOR_MODE_COOKIE_MAX_AGE,
  });
};
