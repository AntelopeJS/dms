import type { InterfaceScale } from "./types";

const INTERFACE_SCALE_COOKIE = "dms-interface-scale";
const INTERFACE_SCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DEFAULT_INTERFACE_SCALE: InterfaceScale = "normal";

export const useInterfaceScale = () => {
  return useDmsCookie<InterfaceScale>(INTERFACE_SCALE_COOKIE, {
    default: () => DEFAULT_INTERFACE_SCALE,
    maxAge: INTERFACE_SCALE_COOKIE_MAX_AGE,
  });
};
