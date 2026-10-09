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

const TIME_UNIT_ORDER = ["y", "M", "w", "d", "h", "m", "s", "ms"] as const;

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

export function formatNumber(
  value: unknown,
  locale: string = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): unknown {
  if (!isNumber(value)) return value;
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return value;
  }
}

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
  m: "m",
  s: "s",
  ms: "ms",
};

// `01:30`, `26:00:30`: hours, then minutes and seconds under 60.
const CLOCK_SPAN = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/;
// `1h30m`, `1h 30m`, `1h:30m` (what `formatTimeSpan` writes), `1.5h`.
const UNIT_SPAN = /^(?:\d+(?:\.\d+)?(?:ms|mo|[Mmwydhs])[\s:]*)+$/;
const UNIT_SPAN_PART = /(\d+(?:\.\d+)?)(ms|mo|[Mmwydhs])/g;

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

function readUnitSpan(text: string): number | undefined {
  if (!UNIT_SPAN.test(text)) return undefined;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(UNIT_SPAN_PART)) {
    total += Number.parseFloat(amount!) * TIME_UNITS[TIME_SPAN_UNITS[unit!]!];
  }
  return total;
}

/**
 * A duration typed in, in milliseconds: a clock duration (`01:30`,
 * `26:00:30`) or units (`1h30m`, `1h 30m`, `1.5h`), or `undefined` for a
 * text that is neither.
 */
export function readTimeSpan(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  return readClockSpan(text) ?? readUnitSpan(text);
}

export function parseTimeSpan(value: string | number): number {
  if (isNumber(value)) return Number(value);
  return readTimeSpan(value) ?? 0;
}

const DEFAULT_SEPARATOR = ":";
const ZERO_MS = "0ms";

export function formatTimeSpan(
  ms: unknown,
  separator: string = DEFAULT_SEPARATOR,
): string {
  if (!isNumber(ms)) return String(ms);

  const totalMs = Number(ms);
  if (totalMs === 0) return ZERO_MS;

  const parts: string[] = [];
  let remaining = Math.abs(totalMs);

  for (const unit of TIME_UNIT_ORDER) {
    const unitValue = TIME_UNITS[unit];
    if (remaining >= unitValue) {
      const value = Math.floor(remaining / unitValue);
      parts.push(`${value}${unit}`);
      remaining %= unitValue;
    }
  }

  const formatted = parts.join(separator);
  return totalMs < 0 ? `-${formatted}` : formatted;
}
