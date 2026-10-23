import {
  currentRegionalPreferences,
  regionalDateTimeFormat,
  regionalDayNumber,
} from "./regional";
import { isNumber } from "./type-check";

const DEFAULT_LOCALE = "en-US";
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_PRICE_FRACTION_DIGITS = 2;

const TIME_UNITS = {
  y: 31536000000,
  M: 2592000000,
  w: 604800000,
  d: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000,
  ms: 1,
} as const;

type TranslateFunction = (
  key: string,
  params?: Record<string, unknown>,
) => string;

type RelativeTimeRule = {
  condition: (diffMs: number, targetDate: Date) => boolean;
  format: (
    t: TranslateFunction,
    diffMs: number,
    targetDate: Date,
    locale: string,
  ) => string;
};

/** Whether `date` fell yesterday, in the user's time zone. */
function isYesterday(date: Date): boolean {
  return regionalDayNumber(date) === regionalDayNumber(new Date()) - 1;
}

function formatTimeHHMM(date: Date, locale: string): string {
  return regionalDateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(date: Date, locale: string): string {
  return regionalDateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

/** "14h05" on a 24-hour clock; the locale's own time on a 12-hour one. */
function formatTimeCompact(date: Date, locale: string): string {
  if (currentRegionalPreferences().timeFormat === "h12") {
    return formatTimeHHMM(date, locale);
  }
  const parts = regionalDateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${Number(read("hour"))}h${read("minute")}`;
}

const RELATIVE_TIME_RULES: RelativeTimeRule[] = [
  {
    condition: (diffMs) => diffMs < TIME_UNITS.m,
    format: (t) => t("common.time.just_now"),
  },
  {
    condition: (diffMs) => diffMs < TIME_UNITS.h,
    format: (t, diffMs) =>
      t("common.time.minutes_ago", {
        count: Math.floor(diffMs / TIME_UNITS.m),
      }),
  },
  {
    condition: (diffMs) => diffMs < TIME_UNITS.d,
    format: (t, diffMs) =>
      t("common.time.hours_ago", { count: Math.floor(diffMs / TIME_UNITS.h) }),
  },
  {
    condition: (_, targetDate) => isYesterday(targetDate),
    format: (t, _, targetDate, locale) =>
      t("common.time.yesterday_at", {
        time: formatTimeHHMM(targetDate, locale),
      }),
  },
];

export function formatRelativeTime(
  date: Date | string | number,
  t: TranslateFunction,
  locale: string = DEFAULT_LOCALE,
): string {
  const timestamp =
    date instanceof Date ? date.getTime() : new Date(date).getTime();
  const targetDate = new Date(timestamp);
  const diffMs = Date.now() - timestamp;

  for (const rule of RELATIVE_TIME_RULES) {
    if (rule.condition(diffMs, targetDate)) {
      return rule.format(t, diffMs, targetDate, locale);
    }
  }

  return t("common.time.on_date", {
    date: `${formatShortDate(targetDate, locale)} ${formatTimeCompact(targetDate, locale)}`,
  });
}

interface RelativeUnit {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
  /** The unit applies below this distance. */
  below: number;
}

// Months and years by their average length: a distance, not a calendar span.
const MONTH_MS = 30 * TIME_UNITS.d;
const YEAR_MS = 365 * TIME_UNITS.d;

const RELATIVE_UNITS: RelativeUnit[] = [
  { unit: "minute", ms: TIME_UNITS.m, below: TIME_UNITS.h },
  { unit: "hour", ms: TIME_UNITS.h, below: TIME_UNITS.d },
  { unit: "day", ms: TIME_UNITS.d, below: TIME_UNITS.w },
  { unit: "week", ms: TIME_UNITS.w, below: MONTH_MS },
  { unit: "month", ms: MONTH_MS, below: YEAR_MS },
  { unit: "year", ms: YEAR_MS, below: Number.POSITIVE_INFINITY },
];

export interface RelativeDistanceOptions {
  /** `long` ("in 3 hours") by default; `short` ("in 3 hr.") for tight cells. */
  style?: Intl.RelativeTimeFormatStyle;
  /** The instant the distance is measured from; defaults to now. */
  now?: number;
}

/**
 * "in 3 days", "tomorrow", "2 hours ago": the distance between `date` and
 * now, past or future, in the largest unit that keeps it a whole number. Not
 * capitalised, so it reads inside a sentence.
 */
export function formatRelativeDistance(
  date: string | number | Date,
  locale: string,
  { style = "long", now = Date.now() }: RelativeDistanceOptions = {},
): string {
  const deltaMs = new Date(date).getTime() - now;
  const distance = Math.abs(deltaMs);
  const unit =
    RELATIVE_UNITS.find((candidate) => distance < candidate.below) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1]!;
  const value = Math.round(deltaMs / unit.ms);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto", style }).format(
    value,
    unit.unit,
  );
}

const defaultDateFormatterOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "2-digit",
};

const defaultTimeFormatterOptions: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

export function formatDate(
  date: unknown,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  if (date === undefined || date === null) {
    return null;
  }

  let validDate: Date;
  const formatOptions = options || defaultDateFormatterOptions;

  try {
    if (date instanceof Date) {
      validDate = date;
    } else {
      validDate = new Date(date as string | number);
    }

    if (Number.isNaN(validDate.getTime())) {
      return null;
    }

    return regionalDateTimeFormat(locale, formatOptions).format(validDate);
  } catch {
    return null;
  }
}

export function formatTime(
  date: Date | string | number | undefined | null,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return formatDate(date, locale, options || defaultTimeFormatterOptions);
}

export function formatDateTime(
  date: Date | string | number | undefined | null,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  return formatDate(date, locale, {
    ...defaultDateFormatterOptions,
    ...defaultTimeFormatterOptions,
    ...options,
  });
}

/**
 * `new Intl.NumberFormat(locale, options)` the way the interface writes a
 * figure: a four-digit one grouped like a longer one ("1 234" next to
 * "12 345", where Spanish or Polish would leave "1234" by default).
 * `options.useGrouping` still decides. Throws as `Intl.NumberFormat` does on
 * options it refuses.
 */
export function readableNumberFormat(
  locale?: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { useGrouping: true, ...options });
}

/**
 * A number written for `locale` (see {@link readableNumberFormat}); a value
 * that is not a number is returned as is. Options Intl refuses (an unknown
 * currency) write the bare number.
 */
export function formatNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string;
export function formatNumber(
  value: unknown,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): unknown;
export function formatNumber(
  value: unknown,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): unknown {
  if (!isNumber(value)) return value;
  try {
    return readableNumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

/** An amount, in euros unless `options.currency` says otherwise. */
export function formatPrice(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string;
export function formatPrice(
  value: unknown,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): unknown;
export function formatPrice(
  value: unknown,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): unknown {
  return formatNumber(value, locale, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    minimumFractionDigits: DEFAULT_PRICE_FRACTION_DIGITS,
    maximumFractionDigits: DEFAULT_PRICE_FRACTION_DIGITS,
    ...options,
  });
}

/** A ratio as a percentage (`0.25` → "25%"). */
export function formatPercentage(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): string;
export function formatPercentage(
  value: unknown,
  locale?: string,
  options?: Intl.NumberFormatOptions,
): unknown;
export function formatPercentage(
  value: unknown,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): unknown {
  return formatNumber(value, locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: DEFAULT_PRICE_FRACTION_DIGITS,
    ...options,
  });
}

const TIME_SPAN_UNITS: Record<string, keyof typeof TIME_UNITS> = {
  y: "y",
  M: "M",
  mo: "M",
  w: "w",
  d: "d",
  h: "h",
  min: "m",
  m: "m",
  s: "s",
  ms: "ms",
};

// `01:30`, `8:15`, `26:00:30`: hours, then minutes and seconds under 60.
const CLOCK_SPAN = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/;
// `8h15`, `8 h 05`: hours, then bare minutes, the way a time is often written.
const HOUR_MINUTE_SPAN = /^(\d+)\s*h\s*([0-5]?\d)$/i;
// `1h30m`, `1h 30m`, `7 h 30 min`, `1h:30m` (older displays), `1.5h`.
const UNIT_SPAN = /^(?:\d+(?:[.,]\d+)?\s*(?:ms|mo|min|[Mmwydhs])[\s:]*)+$/;
const UNIT_SPAN_PART = /(\d+(?:[.,]\d+)?)\s*(ms|mo|min|[Mmwydhs])/g;

function readClockSpan(text: string): number | undefined {
  const match = CLOCK_SPAN.exec(text);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  return (
    Number(hours) * TIME_UNITS.h +
    Number(minutes) * TIME_UNITS.m +
    Number(seconds ?? 0) * TIME_UNITS.s
  );
}

function readHourMinuteSpan(text: string): number | undefined {
  const match = HOUR_MINUTE_SPAN.exec(text);
  if (!match) return undefined;
  const [, hours, minutes] = match;
  return Number(hours) * TIME_UNITS.h + Number(minutes) * TIME_UNITS.m;
}

function readUnitSpan(text: string): number | undefined {
  if (!UNIT_SPAN.test(text)) return undefined;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(UNIT_SPAN_PART)) {
    const value = Number.parseFloat(amount!.replace(",", "."));
    total += value * TIME_UNITS[TIME_SPAN_UNITS[unit!]!];
  }
  return total;
}

/**
 * A duration typed in, in milliseconds: a clock duration (`01:30`, `8:15`,
 * `26:00:30`), hours then minutes (`8h15`, `8h`) or units (`1h30m`,
 * `1h 30m`, `7 h 30 min`, `1.5h`), a `-` before any of them for a negative
 * one, or `undefined` for a text that is neither. It reads all
 * {@link formatDuration} writes.
 */
export function readTimeSpan(value: string): number | undefined {
  const trimmed = value.trim();
  const isNegative = trimmed.startsWith("-");
  const text = isNegative ? trimmed.slice(1).trimStart() : trimmed;
  if (!text) return undefined;
  const span =
    readClockSpan(text) ?? readHourMinuteSpan(text) ?? readUnitSpan(text);
  return span !== undefined && isNegative ? -span : span;
}

export function parseTimeSpan(value: string | number): number {
  if (isNumber(value)) return Number(value);
  return readTimeSpan(value) ?? 0;
}

// Durations count in hours at most: a day or a month is a calendar span, not
// a number of hours.
const DURATION_UNITS = [
  { symbol: "h", ms: TIME_UNITS.h, fractionDigits: 0 },
  { symbol: "min", ms: TIME_UNITS.m, fractionDigits: 0 },
  // The seconds carry the milliseconds, so nothing is rounded away.
  { symbol: "s", ms: TIME_UNITS.s, fractionDigits: 3 },
] as const;
const MS_FRACTION_DIGITS = 3;

/**
 * How exact a written duration is: `exact` (the default) keeps every
 * millisecond, so a field shows the value it holds and {@link readTimeSpan}
 * reads it back; `rounded` keeps two units at most, the smaller one rounded
 * ("2.1 s", "4 min 12 s", "7 h 30 min"), for a cell read at a glance.
 */
export type DurationPrecision = "exact" | "rounded";

export interface DurationFormatOptions {
  precision?: DurationPrecision;
}

const ROUNDED_SECONDS_FRACTION_DIGITS = 1;

function durationFigure(
  locale: string,
  value: number,
  symbol: string,
  fractionDigits: number,
): string {
  const figure = readableNumberFormat(locale, {
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
    numberingSystem: "latn",
  }).format(value);
  return `${figure} ${symbol}`;
}

function exactDuration(ms: number, locale: string): string {
  let remaining = ms;
  if (remaining < TIME_UNITS.s) {
    return durationFigure(locale, remaining, "ms", MS_FRACTION_DIGITS);
  }
  const parts: string[] = [];
  for (const { symbol, ms: unitMs, fractionDigits } of DURATION_UNITS) {
    const amount = fractionDigits
      ? remaining / unitMs
      : Math.floor(remaining / unitMs);
    remaining -= amount * unitMs;
    if (amount)
      parts.push(durationFigure(locale, amount, symbol, fractionDigits));
  }
  return parts.join(" ");
}

function roundedDuration(ms: number, locale: string): string {
  if (ms < TIME_UNITS.s) return durationFigure(locale, Math.round(ms), "ms", 0);
  if (ms < TIME_UNITS.m) {
    return durationFigure(
      locale,
      ms / TIME_UNITS.s,
      "s",
      ROUNDED_SECONDS_FRACTION_DIGITS,
    );
  }
  const [major, majorSymbol, minor, minorSymbol] =
    ms < TIME_UNITS.h
      ? ([TIME_UNITS.m, "min", TIME_UNITS.s, "s"] as const)
      : ([TIME_UNITS.h, "h", TIME_UNITS.m, "min"] as const);
  // Rounded as a whole first, so 1 min 59.7 s reads "2 min", not "1 min 60 s".
  const total = Math.round(ms / minor) * minor;
  const whole = Math.floor(total / major);
  const rest = (total - whole * major) / minor;
  const head = durationFigure(locale, whole, majorSymbol, 0);
  return rest
    ? `${head} ${durationFigure(locale, rest, minorSymbol, 0)}`
    : head;
}

/**
 * A duration in milliseconds the way people write it, its figures in the
 * reader's locale: "910 ms", "2.149 s", "4 min 12 s", "7 h 30 min". The one
 * writer of a duration, for a field and a cell alike. Exact by default (hours
 * and minutes whole, the seconds carrying the milliseconds), its figures
 * neither grouped nor in another script, so {@link readTimeSpan} reads back
 * the very value it wrote; `precision: "rounded"` for a cell.
 */
export function formatDuration(
  ms: number,
  locale: string,
  { precision = "exact" }: DurationFormatOptions = {},
): string {
  const sign = ms < 0 ? "-" : "";
  const write = precision === "rounded" ? roundedDuration : exactDuration;
  return sign + write(Math.abs(ms), locale);
}
