import type { PageLiveNote, PageLiveNoteTone } from "../../../types/live";
import {
  resolveConfirmText,
  type ConfirmTranslate,
} from "../confirm/confirmDialogTexts";

/**
 * How a live note is coloured: a breakdown in 5xx reads as an error.
 *
 * @internal
 */
export const LIVE_NOTE_TONE_CLASSES: Record<PageLiveNoteTone, string> = {
  neutral: "",
  warning: "text-warning",
  error: "text-error",
};

/** A live note as shown, and its colour. @internal */
export interface ShownLiveNote {
  text: string;
  toneClass: string;
}

/**
 * A live note as the toggle and a held table's strip show it: its `$` key
 * translated with its params, or its text.
 *
 * @internal
 */
export function showLiveNote(
  note: PageLiveNote,
  t: ConfirmTranslate,
): ShownLiveNote {
  return {
    text: resolveConfirmText(note.text, note.params ?? {}, t),
    toneClass: LIVE_NOTE_TONE_CLASSES[note.tone ?? "neutral"],
  };
}

/**
 * How many new rows came in: a module's own wording given `{count}`
 * (`missedLabel`), or "N new".
 *
 * @internal
 */
export function missedRowsText(
  count: number,
  missedLabel: string | undefined,
  t: ConfirmTranslate,
): string {
  return missedLabel
    ? resolveConfirmText(missedLabel, { count }, t)
    : t("dms.live.new_rows", { count }, count);
}
