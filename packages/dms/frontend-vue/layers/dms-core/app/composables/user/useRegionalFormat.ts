import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercentage,
  formatPrice,
  formatRelativeTime,
  formatTime,
} from "../../utils/formatter";
import {
  regionalDateTimeFormat,
  type RegionalOptionsSettings,
} from "../../utils/regional";

type DateInput = Date | string | number | undefined | null;

/**
 * The shared formatters bound to the signed-in user's language and regional
 * preferences (Settings › Language & region): the language of the interface,
 * their time zone, clock and date format. Each call reads the current
 * language, so a formatter used in a `computed` follows a language switch.
 *
 * The plain formatters (`formatDate`, `formatNumber`…) fall back to `en-US`
 * when no locale is passed; these never need one.
 */
export function useRegionalFormat() {
  const { t, locale } = useI18n();

  return {
    /** The language the values are written in. */
    locale,
    /**
     * `new Intl.DateTimeFormat` in the user's language with their
     * preferences applied, for a format the helpers below do not cover.
     *
     * @param options What the screen asks for; explicit options win
     * @param settings `keepLocalZone` for calendar days computed in the browser
     */
    dateTimeFormat: (
      options: Intl.DateTimeFormatOptions,
      settings?: RegionalOptionsSettings,
    ) => regionalDateTimeFormat(locale.value, options, settings),
    /** A date ("1 October 2026" by default), `null` when it is not one. */
    formatDate: (date: unknown, options?: Intl.DateTimeFormatOptions) =>
      formatDate(date, locale.value, options),
    /** A time ("14:05:00" by default), `null` when it is not a date. */
    formatTime: (date: DateInput, options?: Intl.DateTimeFormatOptions) =>
      formatTime(date, locale.value, options),
    /** A date and its time, `null` when it is not a date. */
    formatDateTime: (date: DateInput, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(date, locale.value, options),
    /** "just now", "5 minutes ago", "yesterday at 14:05", then the date. */
    formatRelativeTime: (date: Date | string | number) =>
      formatRelativeTime(date, t, locale.value),
    /** A number; a value that is not one is returned as is. */
    formatNumber: (value: unknown, options?: Intl.NumberFormatOptions) =>
      formatNumber(value, locale.value, options),
    /** An amount, in euros unless `options.currency` says otherwise. */
    formatPrice: (value: unknown, options?: Intl.NumberFormatOptions) =>
      formatPrice(value, locale.value, options),
    /** A ratio as a percentage (`0.25` → "25%"). */
    formatPercentage: (value: unknown, options?: Intl.NumberFormatOptions) =>
      formatPercentage(value, locale.value, options),
  };
}
