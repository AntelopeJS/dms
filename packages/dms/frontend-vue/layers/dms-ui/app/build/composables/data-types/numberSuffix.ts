import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isNumber } from "#dms-core/app/utils/type-check";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

/** A formatter writing a number for a locale, with Intl's options. */
type NumberFormatter = (
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
) => string;

/** The options of a numeric field a cell reads besides Intl's. */
interface NumberSuffixOptions {
  /** Unit after the value ("days"): an i18n key with `$`, or a literal. */
  suffix?: string;
}

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
    if (!isNumber(value)) return value;
    const opts: (Intl.NumberFormatOptions & NumberSuffixOptions) | undefined =
      options ?? undefined;
    const formatted = format(value, locale, opts);
    const suffix = opts?.suffix;
    if (!suffix) return formatted;
    const unit = getAppTranslation().processI18n(suffix);
    return `${formatted}${UNIT_SEPARATOR}${unit}`;
  };
}
