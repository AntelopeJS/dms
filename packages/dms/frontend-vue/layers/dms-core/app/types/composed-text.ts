// Mirror of ComposedText and its parameters from
// @antelopejs/interface-dms/base/types/composed-text.

/** A text composed in the reader's language from an i18n key and raw values. */
export interface ComposedText {
  /** The i18n key of the message; the leading `$` is optional. */
  key: string;
  params?: Record<string, ComposedTextParam>;
  /** The parameter whose number picks the plural form; defaults to the first `count`. */
  plural?: string;
}

/** An amount in the minor unit of its currency (cents for `EUR`). */
export interface ComposedTextMoneyParam {
  type: "money";
  value: number;
  currency: string;
}

export type ComposedTextDateFormat = "day" | "short" | "medium" | "long";

export interface ComposedTextDateParam {
  type: "date" | "datetime";
  /** An ISO 8601 string or a timestamp in milliseconds. */
  value: string | number;
  format?: ComposedTextDateFormat;
}

export interface ComposedTextRelativeDateParam {
  type: "relative";
  value: string | number;
}

export type ComposedTextNumberFormat = "decimal" | "percent" | "compact";

export interface ComposedTextNumberParam {
  type: "number";
  value: number;
  format?: ComposedTextNumberFormat;
}

/** Written like a number; picks the plural form unless `plural` names another parameter. */
export interface ComposedTextCountParam {
  type: "count";
  value: number;
}

export type ComposedTextTypedParam =
  | ComposedTextMoneyParam
  | ComposedTextDateParam
  | ComposedTextRelativeDateParam
  | ComposedTextNumberParam
  | ComposedTextCountParam;

export type ComposedTextParamType = ComposedTextTypedParam["type"];

export type ComposedTextParam =
  | string
  | number
  | ComposedTextTypedParam
  | ComposedText;

/** Any text a block draws: a plain string (`$` for an i18n key) or a composed text. */
export type BlockText = string | ComposedText;
