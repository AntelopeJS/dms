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

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatTimeHHMM(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatTimeCompact(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}h${minutes}`;
}

function getYesterday(): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
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
    condition: (_, targetDate) => isSameDay(targetDate, getYesterday()),
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
    date: `${formatShortDate(targetDate, locale)} ${formatTimeCompact(targetDate)}`,
  });
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

    return new Intl.DateTimeFormat(locale, formatOptions).format(validDate);
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

export function parseTimeSpan(value: string | number): number {
  if (isNumber(value)) return Number(value);
  const normalizedValue = value.trim();
  if (!normalizedValue) return 0;

  const UNIT_MAP: Record<string, keyof typeof TIME_UNITS> = {
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

  let totalMs = 0;
  const regex = /(\d+(?:\.\d+)?)(ms|mo|[Mmwydhs])/g;

  let match;
  while ((match = regex.exec(normalizedValue)) !== null) {
    const rawValue = match[1];
    const unit = match[2];
    if (!rawValue || !unit) continue;

    const canonicalUnit = UNIT_MAP[unit];
    if (!canonicalUnit || !(canonicalUnit in TIME_UNITS)) continue;

    const numValue = Number.parseFloat(rawValue);
    totalMs += numValue * TIME_UNITS[canonicalUnit as keyof typeof TIME_UNITS];
  }

  return totalMs;
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
