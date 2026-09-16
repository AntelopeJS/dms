import type { FormFieldValue } from "./value";

export interface FormField {
  id: string;
  label?: string;
  description?: string;
  component: ComponentInfo;
  disabled?: boolean;
  required?: boolean;
  type?: string;
  defaultValue?: FormFieldValue;
  localized?: boolean;
}

export interface FieldGroup {
  id: string;
  label?: string;
  description?: string;
  fields: FormField[];
  orientation?: "horizontal" | "vertical";
  order?: number;
}

export type FormFieldOrGroup = FormField | FieldGroup;

export function isFieldGroup(item: FormFieldOrGroup): item is FieldGroup {
  return "fields" in item && Array.isArray(item.fields);
}
