/**
 * What a form edits, which decides its buttons (interface-dms `FormKind`).
 *
 * - `record` (default): a record, a settings page, a table view's form. It
 *   keeps its values once saved; Cancel while there is nothing to save when
 *   it has somewhere to go back to, then "Unsaved changes" with Discard and
 *   Save.
 * - `action`: a form that does something each time (send a notification,
 *   invite someone, run a job). No buttons while it is untouched — pre-filled
 *   or not —, then Reset and the form's own submit label; it empties after a
 *   successful submit.
 */
export type FormKind = "record" | "action";

/** How a form offers to save (interface-dms `FormSaveMode`). */
export type FormSaveMode = "bar" | "footer" | "none" | "instant";

/**
 * The way a form saves: `bar` unless it says otherwise. An `action` form
 * (send, invite, run) is sent on purpose, so it never saves as it goes.
 */
export function formSaveMode(
  mode: FormSaveMode | undefined,
  kind?: FormKind,
): FormSaveMode {
  if (mode === "instant" && kind === "action") return "bar";
  return mode ?? "bar";
}

/**
 * Whether an action form shows its buttons: once a value changed, or all the
 * time when nothing in it can be changed — it could never be sent otherwise.
 */
export function actionFormShowsButtons(
  dirty: boolean,
  hasChangeableFields: boolean,
): boolean {
  return dirty || !hasChangeableFields;
}
