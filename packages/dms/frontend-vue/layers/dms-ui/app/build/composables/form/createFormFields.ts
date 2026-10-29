import type { FormField } from "../../../composables/form/types/field";
import { isEmptyFormValue } from "../unsaved-changes/formValue";

/**
 * Whether a form creating a record leaves a field out: a read-only one that
 * holds nothing yet (a number, a date, a total the server sets once the
 * record exists) would only read "—". It shows once it holds a value (a
 * default, one a rule computed), and a field declaring `showEmptyOnCreate`
 * keeps its place regardless.
 */
export function isHiddenOnCreate(
  field: FormField,
  value: Parameters<typeof isEmptyFormValue>[0],
): boolean {
  if (field.showEmptyOnCreate) return false;
  if (!field.disabled && !field.readonly) return false;
  return isEmptyFormValue(value);
}
