import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;
const ERROR_CODE_PREFIX = "error.";
const SECURITY_ERRORS_PREFIX = "page.settings.security.errors.";

interface RelativeUnit {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}

/** Largest unit first: the first one that fits at least once is used. */
const RELATIVE_UNITS: RelativeUnit[] = [
  { unit: "year", ms: MS_PER_YEAR },
  { unit: "month", ms: MS_PER_MONTH },
  { unit: "day", ms: MS_PER_DAY },
  { unit: "hour", ms: MS_PER_HOUR },
  { unit: "minute", ms: MS_PER_MINUTE },
];

interface FetchErrorLike {
  data?: unknown;
}

type DateInput = string | Date;

/**
 * Locale-aware dates for the Security and Profile settings, plus the
 * translation of API error codes into sentences.
 */
export function useSecurityFormat() {
  const { locale, t, te } = useI18n();

  const formatDate = (value: DateInput): string =>
    regionalDateTimeFormat(locale.value, { dateStyle: "medium" }).format(
      new Date(value),
    );

  const formatDateTime = (value: DateInput): string =>
    regionalDateTimeFormat(locale.value, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

  const daysSince = (value: DateInput): number =>
    Math.max(
      0,
      Math.floor((Date.now() - new Date(value).getTime()) / MS_PER_DAY),
    );

  /** "3 days ago", "in an hour"… or "now" under a minute. */
  const formatRelative = (value: DateInput): string => {
    const elapsed = new Date(value).getTime() - Date.now();
    const formatter = new Intl.RelativeTimeFormat(locale.value, {
      numeric: "auto",
    });
    const fit = RELATIVE_UNITS.find(({ ms }) => Math.abs(elapsed) >= ms);
    if (!fit) return formatter.format(0, "second");
    return formatter.format(Math.round(elapsed / fit.ms), fit.unit);
  };

  /**
   * @param error What `$authFetch` threw
   * @param fallbackKey Message used when the error carries no known code
   */
  const errorMessage = (error: unknown, fallbackKey: string): string => {
    const code = (error as FetchErrorLike | undefined)?.data;
    if (typeof code !== "string" || !code.startsWith(ERROR_CODE_PREFIX)) {
      return t(fallbackKey);
    }
    const ownKey = `${SECURITY_ERRORS_PREFIX}${code.slice(ERROR_CODE_PREFIX.length)}`;
    if (te(ownKey)) return t(ownKey);
    return te(code) ? t(code) : t(fallbackKey);
  };

  /** @returns The error code (`error.xxx`) the API answered with, if any */
  const errorCode = (error: unknown): string | undefined => {
    const code = (error as FetchErrorLike | undefined)?.data;
    return typeof code === "string" ? code : undefined;
  };

  return {
    formatDate,
    formatDateTime,
    formatRelative,
    daysSince,
    errorMessage,
    errorCode,
  };
}
