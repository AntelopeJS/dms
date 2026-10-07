import type { FormFieldValue } from "./value";

/** A pill beside a read-only field's value. */
export interface FormFieldBadge {
  label: string;
  tone: string;
}

/** A link beside a read-only field's value: where it is changed. */
export interface FormFieldLink {
  label: string;
  to: string;
}

/** A pill or a link beside a read-only field's value. */
export interface FormFieldReadonly {
  badge?: FormFieldBadge;
  link?: FormFieldLink;
}

export interface FormField {
  id: string;
  label?: string;
  description?: string;
  /** A grey help line under the control. */
  hint?: string;
  component: ComponentInfo;
  disabled?: boolean;
  /** Shown, not edited: `true`, or with a pill and a link. */
  readonly?: boolean | FormFieldReadonly;
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

/** How a sectioned form lists its sections. */
export type FormSectionNav = "side" | "jump" | "none";

/** A titled card of a form: the ids of the form's entries it holds. */
export interface FormSection {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  fieldIds: string[];
}

export function isFieldGroup(item: FormFieldOrGroup): item is FieldGroup {
  return "fields" in item && Array.isArray(item.fields);
}
