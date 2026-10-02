import {
  browserTimeZone,
  localeWeekStart,
  readRegionalPreferences,
  type RegionalPreferenceFields,
  type RegionalPreferences,
  type TimeFormatPreference,
} from "../../utils/regional";

const TWELVE_HOUR_CYCLES = ["h11", "h12"];

/** The clock a locale uses on its own (`h12` for en-US, `h23` for fr-FR). */
function localeTimeFormat(locale: string): TimeFormatPreference {
  const { hourCycle } = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions();
  return TWELVE_HOUR_CYCLES.includes(hourCycle ?? "") ? "h12" : "h23";
}

/**
 * The signed-in user's regional preferences (Settings › Language & region),
 * and what they resolve to once the automatic ones are filled in: the
 * browser's time zone, the language's first day of the week and clock.
 *
 * The shared formatters (`formatDate`, `formatDateTime`, the table date
 * types, relative dates…) already apply them; this is for a screen that needs
 * the values themselves, such as a calendar's `weekStartsOn`.
 */
export function useUserRegionalPreferences() {
  const { user } = useUserSession<RegionalPreferenceFields>();
  const { locale } = useI18n();

  const preferences = computed<RegionalPreferences>(() =>
    readRegionalPreferences(user.value),
  );
  const detectedTimeZone = browserTimeZone();
  const timeZone = computed(
    () => preferences.value.timeZone ?? detectedTimeZone,
  );
  const weekStartsOn = computed(
    () => preferences.value.weekStart ?? localeWeekStart(locale.value),
  );
  const timeFormat = computed(
    () => preferences.value.timeFormat ?? localeTimeFormat(locale.value),
  );

  return {
    /** What the user chose; an unset field is automatic. */
    preferences,
    /** The zone the browser runs in, suggested while the zone is automatic. */
    detectedTimeZone,
    timeZone,
    /** 0 Sunday … 6 Saturday, as calendars take it. */
    weekStartsOn,
    timeFormat,
  };
}
