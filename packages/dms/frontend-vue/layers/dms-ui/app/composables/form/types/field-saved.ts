import type { InjectionKey } from "vue";
import type { validateFormState } from "../../../build/composables/form/formValidation";

/**
 * Makes `value` the saved value of the field `id`: a control whose value the
 * server already stored on its own (a rotated secret) is not a change left to
 * save, and "Discard" keeps it.
 */
export type MarkFieldSaved = (
  id: string,
  value: Parameters<typeof validateFormState>[1][string],
) => void;

export const FORM_FIELD_SAVED_KEY: InjectionKey<MarkFieldSaved> =
  Symbol("form-field-saved");
