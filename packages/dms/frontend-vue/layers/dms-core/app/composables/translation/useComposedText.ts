import {
  type ComposableText,
  type ComposedTextTranslate,
  resolveComposedText,
} from "../../utils/composedText";

/**
 * Writes the texts a block receives — a plain or `$`-prefixed string, or a
 * `ComposedText` from its options or its route — in the reader's language,
 * through {@link resolveComposedText}. Each call reads the active locale, so a
 * text written in a `computed` follows a language switch.
 */
export function useComposedText() {
  const { t, locale } = useI18n();

  // vue-i18n reads a third argument as a plural count only when there is one.
  const translate: ComposedTextTranslate = (key, named, plural) =>
    plural === undefined ? t(key, named) : t(key, named, plural);

  function processText(text: ComposableText): string {
    return resolveComposedText(text, { translate, locale: locale.value });
  }

  return { processText };
}
