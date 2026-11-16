/** Stable built-in data-type options. @packageDocumentation */
import { FormComponents } from "../../form-schema";
import { BooleanDisplay, SelectDisplay } from "./inputs";
export type NumberTypeOptions = {
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /**
   * Unit written after the value ("days", "seats"): after the form field,
   * and after the number in table cells, cards and read-only fields. An
   * i18n key with `$`, or a literal. The value stays a bare number.
   */
  suffix?: string;
  /**
   * How wide the form field sits in its row (`"compact"` / `"full"`); left
   * out, it is compact when `min` / `max` fit in 6 digits. See
   * {@link FormComponents.InputWidth}.
   */
  width?: FormComponents.InputWidth;
  fallback?: string;
};

export type PriceTypeOptions = NumberTypeOptions & {
  /**
   * ISO 4217 code of the amount ("USD", "GBP"): the currency table cells,
   * cards, footer sums and read-only fields write it in. Left out, amounts
   * are written in euros.
   */
  currency?: string;
  /**
   * Reads the currency from the rows instead of stating it: the one ISO 4217
   * code that `column`, a column of the table the field belongs to, holds in
   * every row the caller may list, read when a table view serves the page.
   * Amounts are written in euros when the column holds several codes, none,
   * or cannot be read. `currency` wins when both are given.
   */
  currencyFrom?: { column: string };
};

export type StringTypeOptions = {
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  /**
   * Shows the characters typed in the form field, out of `maxLength` when
   * set ("4 / 60"). Defaults to `false`.
   */
  showCount?: boolean;
  textarea?: boolean;
  rows?: number;
  /**
   * A value to read and copy, not to edit (a webhook URL): shown read-only
   * with a copy button.
   */
  copyable?: boolean;
  /**
   * How wide a single-line form field sits in its row (`"compact"` /
   * `"full"`); left out, it is compact when `maxLength` is 16 or less. See
   * {@link FormComponents.InputWidth}.
   */
  width?: FormComponents.InputWidth;
  fallback?: string;
};

export type DateTypeOptions = {
  /**
   * A span of dates: the value is `{ start, end }`, end on or after start.
   * A pair `[start, end]` is read too and validates to the same object.
   */
  range?: boolean;
  multiple?: boolean;
  minDate?: string;
  maxDate?: string;
  fallback?: string;
};

export type BooleanTypeOptions = {
  /**
   * `switch` (default), `checkbox` (required, it must be ticked: an
   * agreement), or `card`: a bordered row with an icon, a title (`label`)
   * and a text (`description`), for a choice that deserves more than a bare
   * switch.
   */
  display?: BooleanDisplay;
  /** Icon of the card. */
  icon?: string;
  /** Text beside the switch or the box, or the card's title. */
  label?: string;
  /** Text under the label, in the control. */
  description?: string;
  fallback?: string;
};

export type SelectTypeOptions = {
  items: FormComponents.SelectOption[];
  /**
   * Reads the options from the rows instead of listing them in `items`
   * (left `[]`): the values `column`, a column of the table the field
   * belongs to, holds in the rows the caller may list, read when a table view
   * serves the page, each labelled and drawn in a tone by the DMS's status
   * rules. A column holding more than 25 values, or that cannot be read,
   * shows its values plain. Any text is a valid value.
   */
  itemsFrom?: { column: string };
  placeholder?: string;
  multiple?: boolean;
  deselectable?: boolean;
  /**
   * `dropdown` (default); `cards`, a card per option with its `description`
   * (one or several picked); `segmented`, the options side by side; `radio`,
   * a list of radio buttons. `segmented` and `radio` pick one: a `multiple`
   * select shows cards instead.
   */
  display?: SelectDisplay;
  /**
   * Cards per row of the `cards` display, once the field is 480px wide.
   * Defaults to 2; ignored by the other displays.
   */
  columns?: number;
  fallback?: string;
};

export type EmailTypeOptions = {
  placeholder?: string;
  fallback?: string;
};

export type ColorTypeOptions = {
  placeholder?: string;
  fallback?: string;
};

export type PasswordTypeOptions = {
  placeholder?: string;
  minLength?: number;
  confirmPassword?: boolean;
  confirmPlaceholder?: string;
  fallback?: string;
};

export type UrlTypeOptions = {
  placeholder?: string;
  fallback?: string;
  /**
   * Shown read-only (a table cell, an expanded row, a record's details),
   * the URL is drawn as the image it points to instead of a link: `avatar`
   * a round thumbnail, `image` a framed one. A remote photo (a profile
   * picture) then reads as a picture; the form still edits it as text.
   */
  preview?: "avatar" | "image";
};

export type PhoneTypeOptions = {
  placeholder?: string;
  requiredPrefix?: boolean;
  fallback?: string;
};

export type RichTextTypeOptions = {
  placeholder?: string;
  fallback?: string;
};

export type StringTimeTypeOptions = {
  placeholder?: string;
  min?: number;
  max?: number;
  fallback?: string;
};
