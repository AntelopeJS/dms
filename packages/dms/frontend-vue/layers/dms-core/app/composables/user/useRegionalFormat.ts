import { computed } from "vue";
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
  regionalFormatLocale,
  type RegionalOptionsSettings,
} from "../../utils/regional";

type DateInput = Date | string | number | undefined | null;

/**
 * A number formatter of `useRegionalFormat`: a number is written as a
 * `string`; a value that is not one is returned as is.
 */
export interface RegionalNumberFormatter {
  (value: number, options?: Intl.NumberFormatOptions): string;
  (value: unknown, options?: Intl.NumberFormatOptions): unknown;
}

/**
 * Which locale the formatters write in: `"interface"`, the interface
 * language as it is (`en`, as the DMS's own blocks write their values), or
 * `"format"`, the locale of the DMS's texts (`formatLocale`: `en` is
 * `en-GB`).
 */
export type RegionalFormatLocale = "interface" | "format";

type NumberFormat = (
  value: unknown,
  locale: string,
  options?: Intl.NumberFormatOptions,
) => unknown;

/** `format` bound to the locale `locale()` answers at each call. */
function numberFormatter(
  format: NumberFormat,
  locale: () => string,
): RegionalNumberFormatter {
  return ((value: unknown, options?: Intl.NumberFormatOptions) =>
    format(value, locale(), options)) as RegionalNumberFormatter;
}

export interface RegionalFormatOptions {
  /** Defaults to `"interface"`. */
  locale?: RegionalFormatLocale;
}

/**
 * The shared formatters bound to the signed-in user's language and regional
 * preferences (Settings › Language & region): the language of the interface,
 * their time zone, clock and date format. Each call reads the current
 * language, so a formatter used in a `computed` follows a language switch.
 *
 * The plain formatters (`formatDate`, `formatNumber`…) fall back to `en-US`
 * when no locale is passed; these never need one.
 *
 * @param options `{ locale: "format" }` writes every value in `formatLocale`
 */
export function useRegionalFormat(options: RegionalFormatOptions = {}) {
  const { t, locale } = useI18n();
  const formatLocale = computed(() => regionalFormatLocale(locale.value));
  const writeIn = () =>
    options.locale === "format" ? formatLocale.value : locale.value;

  const formatNumberIn = numberFormatter(formatNumber, writeIn);
  const formatPriceIn = numberFormatter(formatPrice, writeIn);
  const formatPercentageIn = numberFormatter(formatPercentage, writeIn);

  return {
    /** The language of the interface (`en`, `fr`). */
    locale,
    /**
     * The locale the DMS's texts are written in for that language: `en` is
     * `en-GB`, `fr` is `fr-FR`. For an `Intl` format of a module's own
     * that reads in the convention of the texts around it.
     */
    formatLocale,
    /**
     * `new Intl.DateTimeFormat` in the user's language with their
     * preferences applied, for a format the helpers below do not cover.
     *
     * @param options What the screen asks for; explicit options win
     * @param settings `keepLocalZone` for calendar days computed in the browser
     */
    dateTimeFormat: (
      dateOptions: Intl.DateTimeFormatOptions,
      settings?: RegionalOptionsSettings,
    ) => regionalDateTimeFormat(writeIn(), dateOptions, settings),
    /** A date ("1 October 2026" in `en-GB`), `null` when it is not one. */
    formatDate: (date: unknown, dateOptions?: Intl.DateTimeFormatOptions) =>
      formatDate(date, writeIn(), dateOptions),
    /** A time ("14:05:00" in `en-GB`), `null` when it is not a date. */
    formatTime: (date: DateInput, dateOptions?: Intl.DateTimeFormatOptions) =>
      formatTime(date, writeIn(), dateOptions),
    /** A date and its time, `null` when it is not a date. */
    formatDateTime: (
      date: DateInput,
      dateOptions?: Intl.DateTimeFormatOptions,
    ) => formatDateTime(date, writeIn(), dateOptions),
    /** "just now", "5 minutes ago", "yesterday at 14:05", then the date. */
    formatRelativeTime: (date: Date | string | number) =>
      formatRelativeTime(date, t, writeIn()),
    /** A number as a `string`; a value that is not one is returned as is. */
    formatNumber: formatNumberIn,
    /** An amount, in euros unless `options.currency` says otherwise. */
    formatPrice: formatPriceIn,
    /** A ratio as a percentage (`0.25` → "25%"). */
    formatPercentage: formatPercentageIn,
  };
}
