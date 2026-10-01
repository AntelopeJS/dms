import {
  readRegionalPreferences,
  type RegionalPreferenceFields,
  setRegionalPreferencesSource,
} from "#dms-core/app/utils/regional";

/**
 * Points the shared date formatters at the signed-in user's regional
 * preferences (time zone, clock, date format, first day of the week). Read on
 * every format, from the session of the request being rendered, so the server
 * HTML and the browser agree and a saved preference applies at once.
 */
export default defineDmsPlugin(() => {
  setRegionalPreferencesSource(() =>
    readRegionalPreferences(
      useUserSession<RegionalPreferenceFields>().user.value,
    ),
  );
});
