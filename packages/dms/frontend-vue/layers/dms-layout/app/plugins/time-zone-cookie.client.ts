import { useTimeZoneCookie } from "#dms-core/app/composables/period/periodTimeZone";
import { browserTimeZone } from "#dms-core/app/utils/regional";

/**
 * Keeps the browser's time zone in its cookie, so that the next server render
 * resolves the dashboards' periods in it (see `usePeriodScope`).
 */
export default defineDmsPlugin(() => {
  const cookie = useTimeZoneCookie();
  const zone = browserTimeZone();
  if (cookie.value !== zone) cookie.value = zone;
});
