import type { Ref } from "vue";
import { isKnownTimeZone } from "../../utils/regional";

/**
 * The browser's time zone, kept in a cookie for a server render: a period is
 * made of calendar days in the browser's zone, which the server has no other
 * way to know.
 */
export const TIME_ZONE_COOKIE = "dms-time-zone";
const TIME_ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The browser's time zone as its cookie holds it; `null` before it is written. */
export function useTimeZoneCookie(): Ref<string | null> {
  return useDmsCookie<string | null>(TIME_ZONE_COOKIE, {
    default: () => null,
    maxAge: TIME_ZONE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
}

/**
 * Whether this render resolves a period as the browser does. The browser
 * always does; a server once the browser's cookie names its time zone, in
 * which the presets then resolve (`readerClock`).
 */
export function resolvesPeriodsAsBrowser(): boolean {
  if (typeof window !== "undefined") return true;
  const zone = useTimeZoneCookie().value;
  return !!zone && isKnownTimeZone(zone);
}
