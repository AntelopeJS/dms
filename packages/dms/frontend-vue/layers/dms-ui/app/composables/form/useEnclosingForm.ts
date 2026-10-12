import { getCurrentScope, inject, onScopeDispose } from "vue";
import { FORM_HANDLE_KEY } from "../../build/composables/form/enclosingForm";
import type { FormValidator } from "./types/validation";

/** The DMS `Form` a custom field is drawn in (see {@link useEnclosingForm}). */
export interface EnclosingForm {
  /**
   * Submits the form as its save button does: the form validates its fields,
   * runs the validators, then sends what changed. Resolves once the submit
   * was handled; a refused one shows its errors as usual.
   */
  submit: () => Promise<void>;
  /**
   * Runs `validator` before each submit: answering `false` stops it, before
   * anything is sent (and before the other validators). Removed when the
   * calling component goes, or by calling the returned function.
   */
  addValidator: (validator: FormValidator) => () => void;
  /**
   * Brings a field of the form into view, by its id, and focuses its control:
   * its first focusable part when the control is a group.
   */
  focusField: (fieldId: string) => Promise<void>;
}

/**
 * The DMS `Form` the calling component is drawn in: what a custom field (an
 * `inputComponent` of the module's own) needs of it without reading the DOM.
 * `null` outside a `Form`.
 *
 * ```ts
 * const form = useEnclosingForm();
 * const { confirm } = useConfirm();
 * // Ask before a save that deletes data; submit again once confirmed.
 * form?.addValidator(() => {
 *   if (!isLowered.value || isConfirmed) return true;
 *   void confirm({ title: "Delete older logs?" }).then((accepted) => {
 *     isConfirmed = accepted;
 *     if (accepted) void form.submit();
 *   });
 *   return false;
 * });
 * ```
 *
 * A page opened on the anchor of a field (`/settings#retentionDays`, the
 * field's id) scrolls to it and focuses it once the form is drawn, without
 * any of this: `focusField` is for a link or a button inside the page.
 */
export function useEnclosingForm(): EnclosingForm | null {
  const handle = inject(FORM_HANDLE_KEY, null);
  if (!handle) return null;
  return {
    submit: handle.submit,
    addValidator: (validator) => {
      const remove = handle.registerValidator(validator);
      if (getCurrentScope()) onScopeDispose(remove);
      return remove;
    },
    focusField: handle.revealField,
  };
}
