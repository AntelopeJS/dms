import { getDataTypeId } from "../data-types/core";
import { FormField, FormFieldSerialized } from "../form-types";

/**
 * A form field as the client reads it: its data type reduced to an id.
 *
 * @internal
 */
export function serializeFormField(field: FormField): FormFieldSerialized {
  const typeId = getDataTypeId(field.type) || "unknown";

  return {
    id: field.id,
    label: field.label,
    description: field.description,
    hint: field.hint,
    component: field.inputComponent || field.type.inputComponent(),
    disabled: field.disabled,
    readonly: field.readonly,
    type: typeId,
    required: field.required,
    defaultValue: field.defaultValue,
    localized: field.localized,
  };
}
