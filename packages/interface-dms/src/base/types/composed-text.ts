/**
 * A text the dashboard composes in the reader's language: an i18n key and the
 * raw values its message names, each formatted for the reader's locale, time
 * zone and clock when the text is drawn. The server sends the values, never a
 * finished sentence, so a route answers the same JSON whatever the language of
 * the person reading it.
 *
 * The key is looked up like any `$`-prefixed text, with or without its `$`:
 * `"saas.billing.retry"` and `"$saas.billing.retry"` are the same message.
 * A key the active language lacks falls back to the fallback language, then to
 * the bare key.
 *
 * Plurals follow vue-i18n: the message lists its forms split by `|`
 * (`"no seat | {count} seat | {count} seats"`) and the number named by
 * `plural` picks one — by default the first `count` parameter.
 *
 * @example
 * ```typescript
 * // "saas.banner.past_due": "Invoice {invoice} of {amount} failed, retry {date}"
 * const text: ComposedText = {
 *   key: "saas.banner.past_due",
 *   params: {
 *     invoice: "INV-0042",
 *     amount: { type: "money", value: 2900, currency: "EUR" },
 *     date: { type: "date", value: "2026-10-10", format: "day" },
 *   },
 * };
 * ```
 */
export interface ComposedText {
  /** The i18n key of the message; the leading `$` is optional. */
  key: string;
  /** The values the message names, by the name it gives them. */
  params?: Record<string, ComposedTextParam>;
  /**
   * The parameter whose number picks the plural form. Defaults to the first
   * `count` parameter; without one the message is not pluralised.
   */
  plural?: string;
}

/**
 * An amount in the minor unit of its currency (cents for `EUR`, yen for
 * `JPY`), written with the currency's symbol in the reader's locale:
 * `{ type: "money", value: 92200, currency: "EUR" }` reads "€922.00" in
 * English, "922,00 €" in French.
 */
export interface ComposedTextMoneyParam {
  type: "money";
  /** The amount in minor units: an integer, the way payment providers store it. */
  value: number;
  /** ISO 4217 code. An unknown code writes the amount as a plain number. */
  currency: string;
}

/** How much of a date a `date` or `datetime` parameter writes. */
export const COMPOSED_TEXT_DATE_FORMATS = [
  "day",
  "short",
  "medium",
  "long",
] as const;

/**
 * `day`: day and month ("Oct 10"); `short`: numeric ("10/10/2026");
 * `medium`: the month abbreviated ("Oct 10, 2026"); `long`: the month in
 * full ("October 10, 2026").
 */
export type ComposedTextDateFormat =
  (typeof COMPOSED_TEXT_DATE_FORMATS)[number];

/**
 * A date (`date`), or a date and its time (`datetime`), in the reader's
 * language, time zone and date format preference.
 */
export interface ComposedTextDateParam {
  type: "date" | "datetime";
  /** An ISO 8601 string or a timestamp in milliseconds. */
  value: string | number;
  /** Defaults to `medium`. */
  format?: ComposedTextDateFormat;
}

/**
 * The distance from now, past or future, in the largest whole unit: "in 3
 * days", "tomorrow", "2 hours ago". It is computed when the text is drawn.
 */
export interface ComposedTextRelativeDateParam {
  type: "relative";
  /** An ISO 8601 string or a timestamp in milliseconds. */
  value: string | number;
}

/** How a `number` parameter is written. */
export const COMPOSED_TEXT_NUMBER_FORMATS = [
  "decimal",
  "percent",
  "compact",
] as const;

/**
 * `decimal`: grouped digits ("1,284.5"); `percent`: a ratio as a percentage
 * (`0.25` → "25%"); `compact`: a short form ("1.3K").
 */
export type ComposedTextNumberFormat =
  (typeof COMPOSED_TEXT_NUMBER_FORMATS)[number];

/** A number written for the reader's locale. */
export interface ComposedTextNumberParam {
  type: "number";
  value: number;
  /** Defaults to `decimal`. */
  format?: ComposedTextNumberFormat;
}

/**
 * A count: written like a number, and the parameter that picks the plural
 * form of the message unless `ComposedText.plural` names another one.
 */
export interface ComposedTextCountParam {
  type: "count";
  value: number;
}

/** A parameter that says how its value is written. */
export type ComposedTextTypedParam =
  | ComposedTextMoneyParam
  | ComposedTextDateParam
  | ComposedTextRelativeDateParam
  | ComposedTextNumberParam
  | ComposedTextCountParam;

/** The `type` of a typed parameter. */
export type ComposedTextParamType = ComposedTextTypedParam["type"];

/**
 * A value a composed text names. A string is inserted as written — it is
 * data (an invoice number, a plan name), not a key; a bare number is written
 * for the locale; a typed parameter is formatted by its `type`; a nested
 * `ComposedText` is composed first ("Business · {seats}" inside a sentence).
 */
export type ComposedTextParam =
  | string
  | number
  | ComposedTextTypedParam
  | ComposedText;

/**
 * Any text a block draws: a plain string, `$`-prefixed for an i18n key, or a
 * {@link ComposedText}. Every option and fetched field typed `BlockText`
 * accepts both, so a route can answer either.
 */
export type BlockText = string | ComposedText;
