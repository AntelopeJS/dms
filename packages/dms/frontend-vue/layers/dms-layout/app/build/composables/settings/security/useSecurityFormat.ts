import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";
import { isObject, isString } from "#dms-core/app/utils/type-check";

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

/** A `$authFetch` failure whose body is an API error code (`error.xxx`). */
interface CodedFetchError {
  data: string;
}

function isCodedFetchError(error: unknown): error is CodedFetchError {
  return error !== null && isObject(error) && isString(error.data);
}

type DateInput = string | Date;

/**
 * Locale-aware dates for the Security and Profile settings, plus the
 * translation of API error codes into sentences.
 *
 * `formatRelative` takes `now` so a list formats against its read time, which
 * the server and the hydrating browser share.
 */
export function useSecurityFormat() {
  const { locale } = useI18n();
  const errorPresenter = useApiErrorPresenter();

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

  const formatRelative = (value: DateInput, now = Date.now()): string => {
    const elapsed = new Date(value).getTime() - now;
    const formatter = new Intl.RelativeTimeFormat(locale.value, {
      numeric: "auto",
    });
    const fit = RELATIVE_UNITS.find(({ ms }) => Math.abs(elapsed) >= ms);
    if (!fit) return formatter.format(0, "second");
    return formatter.format(Math.round(elapsed / fit.ms), fit.unit);
  };

  const errorMessage = (cause: unknown, fallbackKey: string): string => {
    return errorPresenter.resolveError(cause, { fallbackKey })?.message ?? "";
  };

  const errorCode = (cause: unknown): string | undefined =>
    isCodedFetchError(cause) ? cause.data : undefined;

  return {
    formatDate,
    formatDateTime,
    formatRelative,
    daysSince,
    errorMessage,
    errorCode,
  };
}
