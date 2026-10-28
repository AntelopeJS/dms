import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import type { formatNumber } from "#dms-core/app/utils/formatter";
import { isNumber, isString } from "#dms-core/app/utils/type-check";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";

/** A formatter writing a number for a locale, with Intl's options. */
type NumberFormatter = (
  value: Parameters<typeof formatNumber>[0],
  locale: string,
  options?: Parameters<typeof formatNumber>[2],
) => ReturnType<typeof formatNumber>;

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
    const formatted = format(
      value,
      locale,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter erases plugin options; Intl still receives the original unvalidated object and controls malformed-input behavior.
      options as Intl.NumberFormatOptions | undefined,
    );
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The suffix option has no runtime schema; preserve its current unchecked read and translation behavior.
    const suffix = (options as NumberSuffixOptions | undefined)?.suffix;
    if (!suffix || !isNumber(value) || !isString(formatted)) {
      return formatted;
    }
    const unit = getAppTranslation().processI18n(suffix);
    return `${formatted}${UNIT_SEPARATOR}${unit}`;
  };
}
