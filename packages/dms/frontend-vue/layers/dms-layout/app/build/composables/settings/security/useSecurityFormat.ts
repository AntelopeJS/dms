import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";
import { isString } from "#dms-core/app/utils/type-check";

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

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
  const { locale } = useI18n();
  const { resolveError } = useApiErrorPresenter();

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

  /**
   * "3 days ago", "in an hour"… or "now" under a minute, as of `now` (a
   * list's read time, which the server and the hydrating browser share).
   */
  const formatRelative = (value: DateInput, now = Date.now()): string => {
    const elapsed = new Date(value).getTime() - now;
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
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript throws arbitrary values. FetchError-derived parameters would reject the boundary inputs this formatter already handles.
  const errorMessage = (error: unknown, fallbackKey: string): string => {
    return resolveError(error, { fallbackKey })?.message ?? "";
  };

  /** @returns The error code (`error.xxx`) the API answered with, if any */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript throws arbitrary values; a FetchError parameter would narrow this public error boundary.
  const errorCode = (error: unknown): string | undefined => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This historical projection is deliberately unchecked, including nullish and primitive errors; inference cannot project data from unknown without changing the boundary.
    const code = (error as FetchErrorLike | undefined)?.data;
    return isString(code) ? code : undefined;
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
