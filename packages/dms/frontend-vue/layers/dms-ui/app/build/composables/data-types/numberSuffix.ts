import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import {
  getPluginI18n,
  resolveI18nKey,
} from "../../../../../dms-core/app/composables/translation/useTranslation";

/** A formatter writing a number for a locale, with Intl's options. */
type NumberFormatter = (
  value: unknown,
  locale: string,
  options?: Intl.NumberFormatOptions,
) => unknown;

/** The options of a numeric field a cell reads besides Intl's. */
interface NumberSuffixOptions {
  /** Unit after the value ("days"): an i18n key with `$`, or a literal. */
  suffix?: string;
}

// Keeps the unit on the line of its number when a cell wraps.
const UNIT_SEPARATOR = " ";

/**
 * A numeric data type's formatter writing the field's unit after the value,
 * as its form input does ("12.5 kWp"), wherever the type is drawn: table
 * cells, expanded rows, cards, read-only fields. A value that is not a
 * number is left as the formatter returns it.
 *
 * A formatter also runs where no component setup is active (a footer sum, a
 * group header, an export), so the unit is translated through the
 * application's composer, never through a composable.
 */
export function withNumberSuffix(format: NumberFormatter): DataTypeFormatter {
  return (value, locale, options) => {
    const formatted = format(
      value,
      locale,
      options as Intl.NumberFormatOptions | undefined,
    );
    const suffix = (options as NumberSuffixOptions | undefined)?.suffix;
    if (!suffix || typeof value !== "number" || typeof formatted !== "string") {
      return formatted;
    }
    const unit = resolveI18nKey(getPluginI18n().translate, suffix);
    return `${formatted}${UNIT_SEPARATOR}${unit}`;
  };
}
