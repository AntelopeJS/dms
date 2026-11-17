import { getDataTypeId } from "../data-type";
import type { FormField, FormFieldSerialized } from "../form-field";

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
    showEmptyOnCreate: field.showEmptyOnCreate,
    type: typeId,
    required: field.required,
    defaultValue: field.defaultValue,
    offersDefault: field.offersDefault,
    localized: field.localized,
    visibleWhen: field.visibleWhen,
    disabledWhen: field.disabledWhen,
    fallbackLocale: field.fallbackLocale,
  };
}
