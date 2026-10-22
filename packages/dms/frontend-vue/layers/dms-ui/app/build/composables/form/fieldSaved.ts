import type { Ref } from "vue";
import type { MarkFieldSaved } from "../../../composables/form/types/field-saved";
import type {
  FormData,
  FormFieldValue,
} from "../../../composables/form/types/value";
import { cloneFormValue } from "../../../composables/form/useForm";
import type { UseFormDirtyReturn } from "../../../composables/unsaved-changes/useFormDirty";
import type { InstantForm } from "./useInstantForm";

type FormValues = Record<string, unknown>;

/** What a field the server saved on its own updates in its form. */
export interface FieldSavedTargets {
  /** Whether the form has the field: another control's id is left alone. */
  hasField: (id: string) => boolean;
  /** The values "Discard" puts back. */
  initialValues: Ref<FormData>;
  /** The values the form reads as unchanged. */
  dirty: Pick<UseFormDirtyReturn<FormValues>, "baseline" | "markClean">;
  /** The instant save of a form saving as it goes. */
  instantSave?: Pick<InstantForm, "confirmField">;
}

/**
 * The form's answer to a field whose value the server stored on its own (a
 * rotated secret): that value becomes the one the field is compared with and
 * the one "Discard" puts back, and an instant form does not save it again.
 */
export function fieldSavedMarker(targets: FieldSavedTargets): MarkFieldSaved {
  return (id, value) => {
    if (!targets.hasField(id)) return;
    targets.initialValues.value = {
      ...targets.initialValues.value,
      [id]: cloneFormValue(value as FormFieldValue) as FormFieldValue,
    };
    targets.dirty.markClean({ ...targets.dirty.baseline.value, [id]: value });
    targets.instantSave?.confirmField(id, value);
  };
}
