import type {
  BlockText,
  ComposedText,
  ComposedTextDateFormat,
  ComposedTextDateParam,
  ComposedTextMoneyParam,
  ComposedTextNumberFormat,
  ComposedTextNumberParam,
  ComposedTextParam,
  ComposedTextParamType,
  ComposedTextRelativeDateParam,
  ComposedTextTypedParam,
} from "../types/composed-text";
import {
  readTranslationKey,
  resolveI18nKey,
} from "../composables/translation/useTranslation";
import { formatDate, formatNumber, formatRelativeDistance } from "./formatter";

/** `t` as vue-i18n takes it: the key, the named values, the plural count. */
export type ComposedTextTranslate = (
  key: string,
  named: Record<string, unknown>,
  plural?: number,
) => string;

/** What a composed text is written with. */
export interface ComposedTextContext {
  translate: ComposedTextTranslate;
  /** The language the values are written in. */
  locale: string;
  /** The instant relative dates are measured from; defaults to now. */
  now?: number;
}

/** Any value a text slot of a block may receive, fetched data included. */
export type ComposableText = BlockText | number | null | undefined;

type ParamFormatter<Param extends ComposedTextTypedParam> = (
  param: Param,
  context: ComposedTextContext,
) => string;

type ParamFormatters = {
  [Type in ComposedTextParamType]: ParamFormatter<
    Extract<ComposedTextTypedParam, { type: Type }>
  >;
};

// What a currency without a known minor unit is assumed to have, as most do.
const DEFAULT_MINOR_DIGITS = 2;
const DECIMAL_BASE = 10;
const DEFAULT_DATE_FORMAT: ComposedTextDateFormat = "medium";

const DATE_FORMATS: Record<ComposedTextDateFormat, Intl.DateTimeFormatOptions> =
  {
    day: { month: "short", day: "numeric" },
    short: { dateStyle: "short" },
    medium: { dateStyle: "medium" },
    long: { dateStyle: "long" },
  };

// Intl refuses `dateStyle` next to `hour`, so each format names its time the
// way its date is written.
const DATETIME_FORMATS: Record<
  ComposedTextDateFormat,
  Intl.DateTimeFormatOptions
> = {
  day: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  short: { dateStyle: "short", timeStyle: "short" },
  medium: { dateStyle: "medium", timeStyle: "short" },
  long: { dateStyle: "long", timeStyle: "short" },
};

const NUMBER_FORMATS: Record<
  ComposedTextNumberFormat,
  Intl.NumberFormatOptions
> = {
  decimal: {},
  percent: { style: "percent", maximumFractionDigits: 2 },
  compact: { notation: "compact" },
};

/** Whether a value is a composed text rather than a plain string. */
export function isComposedText(value: unknown): value is ComposedText {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ComposedText).key === "string"
  );
}

function isTypedParam(value: unknown): value is ComposedTextTypedParam {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ComposedTextTypedParam).type === "string"
  );
}

function formatMoney(
  param: ComposedTextMoneyParam,
  { locale }: ComposedTextContext,
): string {
  try {
    const format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: param.currency,
    });
    const digits =
      format.resolvedOptions().maximumFractionDigits ?? DEFAULT_MINOR_DIGITS;
    return format.format(param.value / DECIMAL_BASE ** digits);
  } catch {
    // A malformed currency code: the amount is still worth showing.
    return String(
      formatNumber(param.value / DECIMAL_BASE ** DEFAULT_MINOR_DIGITS, locale),
    );
  }
}

function dateFormatter(
  formats: Record<ComposedTextDateFormat, Intl.DateTimeFormatOptions>,
): ParamFormatter<ComposedTextDateParam> {
  return (param, { locale }) =>
    formatDate(
      param.value,
      locale,
      formats[param.format ?? DEFAULT_DATE_FORMAT] ?? formats.medium,
    ) ?? String(param.value);
}

function formatNumberParam(
  param: ComposedTextNumberParam,
  { locale }: ComposedTextContext,
): string {
  const options = NUMBER_FORMATS[param.format ?? "decimal"] ?? {};
  return String(formatNumber(param.value, locale, options));
}

function formatRelativeParam(
  param: ComposedTextRelativeDateParam,
  { locale, now }: ComposedTextContext,
): string {
  // Intl throws on an invalid date: the raw value beats a broken page.
  if (Number.isNaN(new Date(param.value).getTime())) return String(param.value);
  return formatRelativeDistance(param.value, locale, { now });
}

const PARAM_FORMATTERS: ParamFormatters = {
  money: formatMoney,
  date: dateFormatter(DATE_FORMATS),
  datetime: dateFormatter(DATETIME_FORMATS),
  relative: formatRelativeParam,
  number: formatNumberParam,
  count: (param, { locale }) => String(formatNumber(param.value, locale)),
};

function formatParam(
  param: ComposedTextParam,
  context: ComposedTextContext,
): string {
  if (typeof param === "string") return param;
  if (typeof param === "number") {
    return String(formatNumber(param, context.locale));
  }
  if (isComposedText(param)) return composeText(param, context);
  const formatter = PARAM_FORMATTERS[param.type] as
    | ParamFormatter<ComposedTextTypedParam>
    | undefined;
  // A type from a newer backend: its raw value beats a hole in the sentence.
  return formatter ? formatter(param, context) : String(param.value ?? "");
}

function numberOf(param: ComposedTextParam | undefined): number | undefined {
  if (typeof param === "number") return param;
  if (isTypedParam(param) && typeof param.value === "number") {
    return param.value;
  }
  return undefined;
}

function pluralCount(text: ComposedText): number | undefined {
  const params = text.params ?? {};
  const name =
    text.plural ??
    Object.keys(params).find((candidate) => {
      const param = params[candidate];
      return isTypedParam(param) && param.type === "count";
    });
  return name === undefined ? undefined : numberOf(params[name]);
}

function composeText(text: ComposedText, context: ComposedTextContext): string {
  const { key } = readTranslationKey(text.key);
  const named = Object.fromEntries(
    Object.entries(text.params ?? {}).map(([name, param]) => [
      name,
      formatParam(param, context),
    ]),
  );
  const plural = pluralCount(text);
  return plural === undefined
    ? context.translate(key, named)
    : context.translate(key, named, plural);
}

/**
 * Writes any text a block receives in the reader's language: a
 * `ComposedText` is translated with its parameters formatted for `locale`
 * (amounts, dates, counts and their plural), a `$`-prefixed string is
 * translated, any other string is returned as written, a number is written
 * for `locale`, and nothing is the empty string.
 *
 * A key the active language lacks falls back as vue-i18n does: to the
 * fallback language, then to the bare key.
 */
export function resolveComposedText(
  text: ComposableText,
  context: ComposedTextContext,
): string {
  if (text === null || text === undefined) return "";
  if (typeof text === "number") {
    return String(formatNumber(text, context.locale));
  }
  if (isComposedText(text)) return composeText(text, context);
  return resolveI18nKey(context.translate, String(text));
}
