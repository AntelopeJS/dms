import type { InjectionKey } from "vue";

/**
 * Makes `value` the saved value of the field `id`: a control whose value the
 * server already stored on its own (a rotated secret) is not a change left to
 * save, and "Discard" keeps it.
 */
export type MarkFieldSaved = (id: string, value: unknown) => void;

export const FORM_FIELD_SAVED_KEY: InjectionKey<MarkFieldSaved> =
  Symbol("form-field-saved");
