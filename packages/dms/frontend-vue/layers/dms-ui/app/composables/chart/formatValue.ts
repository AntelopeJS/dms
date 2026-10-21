import type { ValueFormat, ValuePrecision } from "./types";

const PERCENT_DIVISOR = 100;
const CURRENCY_FRACTION_DIGITS = 0;
const PERCENT_FRACTION_DIGITS = 1;
const COMPACT_FRACTION_DIGITS = 1;
const DEFAULT_LOCALE = "en";
const DEFAULT_CURRENCY = "EUR";

const CURRENCY_PART_TYPE = "currency";
const PERCENT_PART_TYPE = "percent";
const COMPACT_PART_TYPE = "compact";

const IDENTITY = (value: number) => value;
const TO_PERCENT_RATIO = (value: number) => value / PERCENT_DIVISOR;

interface NumberFormatConfig {
  transform: (value: number) => number;
  options: (currency: string) => Intl.NumberFormatOptions;
  unitPartType: string | null;
}

const NUMBER_FORMAT_CONFIGS: Record<ValueFormat, NumberFormatConfig> = {
  number: {
    transform: IDENTITY,
    options: () => ({}),
    unitPartType: null,
  },
  currency: {
    transform: IDENTITY,
    options: (currency) => ({
      style: "currency",
      currency,
      maximumFractionDigits: CURRENCY_FRACTION_DIGITS,
    }),
    unitPartType: CURRENCY_PART_TYPE,
  },
  percent: {
    transform: TO_PERCENT_RATIO,
    options: () => ({
      style: "percent",
      maximumFractionDigits: PERCENT_FRACTION_DIGITS,
    }),
    unitPartType: PERCENT_PART_TYPE,
  },
  compact: {
    transform: IDENTITY,
    options: () => ({
      notation: "compact",
      maximumFractionDigits: COMPACT_FRACTION_DIGITS,
    }),
    unitPartType: COMPACT_PART_TYPE,
  },
};

function resolveConfig(format: ValueFormat): NumberFormatConfig {
  return NUMBER_FORMAT_CONFIGS[format] ?? NUMBER_FORMAT_CONFIGS.number;
}

function precisionOptions(
  options: Intl.NumberFormatOptions,
  precision?: ValuePrecision,
): Intl.NumberFormatOptions {
  if (precision === undefined) return options;
  if (precision === "native") {
    return { ...options, maximumFractionDigits: undefined };
  }
  return {
    ...options,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  };
}

/** Formats a chart value, preserving legacy defaults unless precision is supplied. */
export function formatValue(
  value: number,
  format: ValueFormat = "number",
  locale = DEFAULT_LOCALE,
  currency = DEFAULT_CURRENCY,
  precision?: ValuePrecision,
): string {
  const config = resolveConfig(format);
  return new Intl.NumberFormat(
    locale,
    precisionOptions(config.options(currency), precision),
  ).format(config.transform(value));
}

const DELTA_SIGN_DISPLAY = "exceptZero";

/**
 * Formats a percentage delta the way the current locale writes it — decimal
 * comma and non-breaking space in French, dot and tight percent in English —
 * with an explicit sign on anything but zero.
 */
export function formatDeltaPercent(
  delta: number,
  locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: PERCENT_FRACTION_DIGITS,
    maximumFractionDigits: PERCENT_FRACTION_DIGITS,
    signDisplay: DELTA_SIGN_DISPLAY,
  }).format(TO_PERCENT_RATIO(delta));
}

export interface FormattedValueParts {
  value: string;
  unit: string;
  unitIsPrefix: boolean;
}

/**
 * What a card prints where its figure would go when the query measured nothing.
 *
 * An em dash and not a zero: a zero is itself a measurement, so a card printing
 * one for a period with no rows in it states a result nobody computed. No unit
 * either — there is no quantity for it to qualify.
 */
export const ABSENT_VALUE_TEXT = "—";

export const ABSENT_VALUE_PARTS: FormattedValueParts = {
  value: ABSENT_VALUE_TEXT,
  unit: "",
  unitIsPrefix: false,
};

/** Splits the same formatted value into numeric and unit parts for KPI cards. */
export function formatValueParts(
  value: number,
  format: ValueFormat = "number",
  locale = DEFAULT_LOCALE,
  currency = DEFAULT_CURRENCY,
  precision?: ValuePrecision,
): FormattedValueParts {
  const config = resolveConfig(format);
  if (!config.unitPartType) {
    return {
      value: formatValue(value, format, locale, currency, precision),
      unit: "",
      unitIsPrefix: false,
    };
  }

  const parts = new Intl.NumberFormat(
    locale,
    precisionOptions(config.options(currency), precision),
  ).formatToParts(config.transform(value));

  const isUnitPart = (part: Intl.NumberFormatPart) =>
    part.type === config.unitPartType;
  const firstUnitIndex = parts.findIndex(isUnitPart);
  const firstValueIndex = parts.findIndex(
    (part) => !isUnitPart(part) && part.value.trim() !== "",
  );

  return {
    value: parts
      .filter((part) => !isUnitPart(part))
      .map((part) => part.value)
      .join("")
      .trim(),
    unit: parts
      .filter(isUnitPart)
      .map((part) => part.value)
      .join(""),
    unitIsPrefix: firstUnitIndex !== -1 && firstUnitIndex < firstValueIndex,
  };
}
