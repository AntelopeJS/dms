import {
  type ComposableText,
  type ComposedTextTranslate,
  resolveComposedText,
} from "../../utils/composedText";
import { getPluginI18n } from "./useTranslation";

type ComposedTextI18n = Pick<ReturnType<typeof useI18n>, "t" | "locale">;

function composedTextOf({ t, locale }: ComposedTextI18n) {
  const translate: ComposedTextTranslate = (key, named, plural) =>
    plural === undefined ? t(key, named) : t(key, named, plural);

  function processText(text: ComposableText): string {
    return resolveComposedText(text, { translate, locale: locale.value });
  }

  return { processText };
}

/**
 * Writes the texts a block receives — a plain or `$`-prefixed string, or a
 * `ComposedText` from its options or its route — in the reader's language,
 * through {@link resolveComposedText}. Each call reads the active locale, so a
 * text written in a `computed` follows a language switch.
 */
export function useComposedText() {
  return composedTextOf(useI18n());
}

/**
 * {@link useComposedText} outside a component setup — in a data-type
 * formatter, which runs wherever a value is drawn (see `getAppTranslation`).
 */
export function getAppComposedText() {
  return composedTextOf(getPluginI18n().i18n);
}
