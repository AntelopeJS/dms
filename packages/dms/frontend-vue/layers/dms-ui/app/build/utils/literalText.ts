import {
  isString,
  isNumber,
  isBoolean,
} from "../../../../dms-core/app/utils/type-check";
import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";

const PLACEHOLDER = /\{(\w+)\}/g;

const isFillable = (value: unknown): value is string | number | boolean =>
  isString(value) || isNumber(value) || isBoolean(value);

/**
 * A literal (non-`$`) text with its `{name}` placeholders filled from
 * `params`, as a `$` key's translation receives them. A placeholder without a
 * value stays as written, so text that merely holds braces is left alone.
 */
export function interpolateLiteral(
  text: string,
  params: Parameters<I18nTranslate>[1],
): string {
  return text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    return isFillable(value) ? String(value) : placeholder;
  });
}
