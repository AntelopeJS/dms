/**
 * The two ways a form's footer behaves.
 *
 * - `record`: a table view's form, in a drawer, a modal or on its form page.
 *   Cancel while there is nothing to save, then "Unsaved changes" with
 *   Discard and Save.
 * - `action`: a form placed on a page to do something (send a notification,
 *   invite someone, run a job). No buttons while it is untouched — pre-filled
 *   or not —, then Reset and the form's own submit label.
 */
export type FormFooterKind = "record" | "action";

export interface FormFooterContext {
  /** The form sits in a drawer or a modal. */
  inContainer: boolean;
  /** The form asks for Cancel (a table view's form page). */
  cancellable?: boolean;
}

export function formFooterKind(context: FormFooterContext): FormFooterKind {
  return context.inContainer || context.cancellable ? "record" : "action";
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
