const TRANSLATION_KEY_PREFIX = "$";

export type I18nTranslate = (
  key: string,
  params: Record<string, unknown>,
) => string;

/**
 * i18n access for DMS app plugins, where `useI18n()` is unavailable: returns the
 * global composer plus an {@link I18nTranslate} bound to it. Inside
 * components prefer `useI18n` / {@link useTranslation}.
 */
export function getPluginI18n() {
  const { $i18n: i18n } = useDmsApp();
  const translate: I18nTranslate = (key, params) => i18n.t(key, params);
  return { i18n, translate };
}

/**
 * Whether a DMS display string is marked as an i18n key, and the key it holds.
 */
export function readTranslationKey(value: string) {
  const isKey = value.startsWith(TRANSLATION_KEY_PREFIX);
  return { isKey, key: isKey ? value.slice(1) : value };
}

/**
 * Resolves a DMS display string: values prefixed with `$` are i18n keys
 * translated through `translate`, anything else is returned verbatim.
 * Use this from contexts without a component instance (e.g. plugins, with
 * `dmsApp.$i18n.t`); inside components prefer {@link useTranslation}.
 */
export function resolveI18nKey(
  translate: I18nTranslate,
  key: string,
  params?: Record<string, unknown> | null,
): string {
  const marked = readTranslationKey(key);
  if (marked.isKey) {
    return translate(marked.key, params ?? {});
  }

  return key;
}

/**
 * Resolves a message sent back by the API. Backend messages are i18n keys,
 * written either bare (`error.unauthorized`) or with the DMS `$` prefix
 * (`$page.settings.invites.error.not_found`). `translate` echoes the key back
 * when no translation exists in the active locale or its fallbacks: a message
 * marked with `$` then falls back to the bare key, and an unmarked one — which
 * may well be plain prose — is shown as it came in.
 */
export function resolveApiMessage(
  translate: I18nTranslate,
  message: unknown,
): string {
  const text = typeof message === "string" ? message : String(message);
  const marked = readTranslationKey(text);
  const translated = translate(marked.key, {});

  if (translated !== marked.key) return translated;
  return marked.isKey ? marked.key : text;
}

/**
 * {@link resolveI18nKey} for optional display strings: returns `undefined` when
 * the value is empty or when a `$` key has no translation. vue-i18n falls back
 * to the bare key path, which callers that index or render the result must not
 * mistake for real text.
 */
export function resolveOptionalI18nKey(
  translate: I18nTranslate,
  key: string | undefined,
  params?: Record<string, unknown> | null,
): string | undefined {
  if (!key) {
    return undefined;
  }

  const resolved = resolveI18nKey(translate, key, params);
  const isUntranslatedKey =
    key.startsWith(TRANSLATION_KEY_PREFIX) &&
    resolved === key.slice(TRANSLATION_KEY_PREFIX.length);

  return isUntranslatedKey ? undefined : resolved;
}

export const useTranslation = () => {
  const { t } = useI18n();

  function processI18n(key: string, params?: Record<string, unknown> | null) {
    return resolveI18nKey(t, key, params);
  }

  function processApiMessage(message: unknown) {
    return resolveApiMessage(t, message);
  }

  return {
    processI18n,
    processApiMessage,
  };
};
