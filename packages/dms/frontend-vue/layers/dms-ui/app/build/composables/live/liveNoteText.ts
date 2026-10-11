import { readTranslationKey } from "#dms-core/app/composables/translation/useTranslation";
import type { PageLiveNote } from "../../../types/live";

/** The `t` of vue-i18n, as the live toggle calls it. @internal */
export type LiveTranslate = (
  key: string,
  named: Record<string, unknown>,
  plural?: number,
) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(text: string, params: Record<string, unknown>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * The text of a live note: its `$` key translated with its parameters,
 * pluralised on `params.count` when it is a number, or its text with the
 * parameters filled in.
 *
 * @internal
 */
export function liveNoteText(t: LiveTranslate, note: PageLiveNote): string {
  const params = note.params ?? {};
  const { isKey, key } = readTranslationKey(note.text);
  if (!isKey) return interpolate(note.text, params);
  const count = params.count;
  return typeof count === "number" ? t(key, params, count) : t(key, params);
}
