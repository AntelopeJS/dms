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
  type I18nTranslate,
} from "../composables/translation/useTranslation";
import {
  formatDate,
  formatNumber,
  formatRelativeDistance,
  readableNumberFormat,
} from "./formatter";
import { isNumber, isObject, isString } from "./type-check";

/** `t` as vue-i18n takes it: the key, the named values, the plural count. */
export type ComposedTextTranslate = (
  key: string,
  named: Parameters<I18nTranslate>[1],
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
export function isComposedText(
  value: Parameters<typeof isObject>[0],
): value is ComposedText {
  return isObject(value) && value !== null && isString(value.key);
}

function isTypedParam(
  value: Parameters<typeof isObject>[0],
): value is ComposedTextTypedParam {
  return isObject(value) && value !== null && isString(value.type);
}

function formatMoney(
  param: ComposedTextMoneyParam,
  { locale }: ComposedTextContext,
): string {
  try {
    const format = readableNumberFormat(locale, {
      style: "currency",
      currency: param.currency,
    });
    const digits =
      format.resolvedOptions().maximumFractionDigits ?? DEFAULT_MINOR_DIGITS;
    return format.format(param.value / DECIMAL_BASE ** digits);
  } catch {
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
  if (Number.isNaN(new Date(param.value).getTime())) return String(param.value);
  return formatRelativeDistance(param.value, locale, { now });
}

const PARAM_TYPES: Record<ComposedTextParamType, true> = {
  money: true,
  date: true,
  datetime: true,
  relative: true,
  number: true,
  count: true,
};

const formatDateParam = dateFormatter(DATE_FORMATS);
const formatDateTimeParam = dateFormatter(DATETIME_FORMATS);

function formatTypedParam(
  param: ComposedTextTypedParam,
  context: ComposedTextContext,
): string {
  if (!Object.hasOwn(PARAM_TYPES, param.type)) {
    return String(param.value ?? "");
  }
  switch (param.type) {
    case "money":
      return formatMoney(param, context);
    case "date":
      return formatDateParam(param, context);
    case "datetime":
      return formatDateTimeParam(param, context);
    case "relative":
      return formatRelativeParam(param, context);
    case "number":
      return formatNumberParam(param, context);
    case "count":
      return String(formatNumber(param.value, context.locale));
  }
}

function formatParam(
  param: ComposedTextParam,
  context: ComposedTextContext,
): string {
  if (isString(param)) return param;
  if (isNumber(param)) {
    return String(formatNumber(param, context.locale));
  }
  if (isComposedText(param)) return composeText(param, context);
  return formatTypedParam(param, context);
}

function numberOf(param: ComposedTextParam | undefined): number | undefined {
  if (isNumber(param)) return param;
  if (isTypedParam(param) && isNumber(param.value)) {
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
  if (isNumber(text)) {
    return String(formatNumber(text, context.locale));
  }
  if (isComposedText(text)) return composeText(text, context);
  return resolveI18nKey(context.translate, String(text));
}
