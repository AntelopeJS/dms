import {
  readRegionalPreferences,
  type RegionalPreferenceFields,
  setReaderTimeZoneSource,
  setRegionalPreferencesSource,
} from "#dms-core/app/utils/regional";
import { useTimeZoneCookie } from "#dms-core/app/composables/period/periodTimeZone";

/**
 * Points the shared date formatters at the signed-in user's regional
 * preferences (time zone, clock, date format, first day of the week), and a
 * server render at the browser's time zone. Read on every format, from the
 * request being rendered, so the server HTML and the browser agree and a
 * saved preference applies at once.
 */
export default defineDmsPlugin(() => {
  setRegionalPreferencesSource(() =>
    readRegionalPreferences(
      useDmsUserSession<RegionalPreferenceFields>().user.value,
    ),
  );
  // A server render writes dates, and resolves periods, in the zone of the
  // browser it renders for (its cookie), as the browser will.
  setReaderTimeZoneSource(() => useTimeZoneCookie().value);
});
