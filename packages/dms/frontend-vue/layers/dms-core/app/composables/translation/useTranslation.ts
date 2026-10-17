const TRANSLATION_KEY_PREFIX = "$";

export type I18nTranslate = (
  key: string,
  params: Record<string, unknown>,
) => string;

/** The message a key holds, as its locale declares it (vue-i18n's `tm`). */
export type I18nRawMessage = (key: string) => unknown;

// Each message that does not compile is reported once, not on every render.
const reportedBrokenMessages = new Set<string>();

function reportBrokenMessage(key: string, error: unknown): void {
  if (!import.meta.env?.DEV || reportedBrokenMessages.has(key)) return;
  reportedBrokenMessages.add(key);
  console.warn(
    `[dms] The translation "${key}" does not compile and is shown as written. Escape its special characters ({'@'}, {'{'}, {'|'}) as literal interpolations.`,
    error,
  );
}

/**
 * `translate`, refusing to throw: a message vue-i18n cannot compile — a raw
 * `@`, read as a linked message, in "first.last@example.com" — is shown as
 * written (the key when its text cannot be read) instead of failing the
 * render of everything around it, a whole form among them.
 */
export function tolerantTranslate(
  translate: I18nTranslate,
  rawMessage?: I18nRawMessage,
): I18nTranslate {
  return (key, params) => {
    try {
      return translate(key, params);
    } catch (error) {
      reportBrokenMessage(key, error);
      const raw = rawMessage?.(key);
      return typeof raw === "string" ? raw : key;
    }
  };
}

/**
 * i18n access for DMS app plugins, where `useI18n()` is unavailable: returns the
 * global composer plus an {@link I18nTranslate} bound to it. Inside
 * components prefer `useI18n` / {@link useTranslation}.
 */
export function getPluginI18n() {
  const { $i18n: i18n } = useDmsApp();
  const translate = tolerantTranslate(
    (key, params) => i18n.t(key, params),
    (key) => i18n.tm(key),
  );
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
 * may well be plain prose — is shown as it came in. `params` fill the
 * translation's placeholders (`"At most {max}"` with `{ max: 5000 }`).
 */
export function resolveApiMessage(
  translate: I18nTranslate,
  message: unknown,
  params?: Record<string, unknown> | null,
): string {
  const text = typeof message === "string" ? message : String(message);
  const marked = readTranslationKey(text);
  const translated = translate(marked.key, params ?? {});

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
  const { t: translate, tm } = useI18n();
  const t = tolerantTranslate(translate, tm);

  function processI18n(key: string, params?: Record<string, unknown> | null) {
    return resolveI18nKey(t, key, params);
  }

  function processApiMessage(
    message: unknown,
    params?: Record<string, unknown> | null,
  ) {
    return resolveApiMessage(t, message, params);
  }

  return {
    processI18n,
    processApiMessage,
  };
};
