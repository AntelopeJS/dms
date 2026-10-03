import { ComponentBuilder, type ComponentInfoSerialized } from "../component";
import { zodToJsonSchema } from "zod-to-json-schema";
import { type DataType } from "./data-types/core";
import type {
  BaseComponentProps,
  DefaultValue,
  EnumOption,
  HttpMethod,
} from "./types";
export namespace FormEvents {
  export const SUBMIT = "DmsComponent.Form.Submit";
  export const SUBMIT_SUCCESS = "DmsComponent.Form.SubmitSuccess";
  export const SUBMIT_ERROR = "DmsComponent.Form.SubmitError";
  export const FIELD_CHANGE = "DmsComponent.Form.FieldChange";
  export const RESET = "DmsComponent.Form.Reset";
}

export namespace FormFunctions {
  export const SET_FIELD_DISABLED = "DmsComponent.Form.SetFieldDisabled";
  export const SET_FIELD_HIDDEN = "DmsComponent.Form.SetFieldHidden";
  export const SET_FIELD_REQUIRED = "DmsComponent.Form.SetFieldRequired";
}

export interface FormField {
  id: string;
  label?: string;
  description?: string;
  type: DataType;
  inputComponent?: ComponentInfoSerialized;
  disabled?: boolean;
  required?: boolean;
  defaultValue?: DefaultValue;
  localized?: boolean;
}

export interface FormFieldSerialized extends Omit<
  FormField,
  "type" | "inputComponent"
> {
  component: ComponentInfoSerialized;
  type: string;
}

export interface FieldGroup {
  id: string;
  label?: string;
  description?: string;
  fields: FormField[];
  orientation?: "horizontal" | "vertical";
  order?: number;
}

export interface FieldGroupSerialized extends Omit<FieldGroup, "fields"> {
  fields: FormFieldSerialized[];
}

export type FormFieldOrGroup = FormField | FieldGroup;
export type FormFieldOrGroupSerialized =
  | FormFieldSerialized
  | FieldGroupSerialized;

export function isFieldGroup(item: FormFieldOrGroup): item is FieldGroup {
  return "fields" in item && Array.isArray(item.fields);
}

export function isFieldGroupSerialized(
  item: FormFieldOrGroupSerialized,
): item is FieldGroupSerialized {
  return "fields" in item && Array.isArray(item.fields);
}

export interface FormProps extends BaseComponentProps {
  title?: string;
  description?: string;
  fields: FormFieldOrGroup[];
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  submitUrl?: string;
  submitUrlMethod?: EnumOption<HttpMethod>;
  successMessage?: string;
  errorMessage?: string;
  /**
   * Label of the submit button (i18n key or literal). Defaults to the generic
   * "Save changes" label.
   */
  submitLabel?: string;
  /**
   * Whether the reset and submit buttons show. Left out, they show once the
   * form has somewhere to submit to and something to fill in.
   */
  showActions?: boolean;
  /**
   * Replaces the footer buttons with the sticky save bar (v2 .st-savebar): it
   * shows only while the form holds unsaved changes, names the changed fields
   * and offers Discard and Save. Suits a settings-like page, e.g. a form inside
   * a `Section`.
   */
  saveBar?: boolean;
  /**
   * With nothing to save, offers Cancel (back to the previous page) instead of
   * hiding the buttons, and words them as a record edit: "Unsaved changes",
   * Discard, Save. Table views set it on their form pages; a form in a drawer
   * or a modal always behaves so. Left out, a form placed on a page (an action
   * form: send, invite, run) shows no buttons until a value changes, then
   * Reset and its `submitLabel`.
   */
  cancellable?: boolean;
  fieldsOrientation?: "horizontal" | "vertical";
  /**
   * Path to navigate to after a successful submit. Supports the same token
   * substitution as `submitUrl` (`{{params.X}}`, `{{query.X}}`) plus
   * `{{response.X}}` which resolves against the JSON response body of the
   * submit request — useful for redirecting to the detail page of a freshly
   * created entity (e.g. `/items/{{response.id}}/edit`).
   */
  redirectOnSuccess?: string;
  /**
   * Empties the form after a successful submit: every field goes back to the
   * value it opened with (its `defaultValue`, or what `fetchUrl` loaded). Suits
   * a form that sends something new each time (a message, an invitation), where
   * the values left behind invite an accidental second submit.
   */
  resetOnSuccess?: boolean;
  /**
   * Default values merged into the submit payload (sent even when the field is
   * absent from the form). String values support the same token substitution
   * as `submitUrl` (`{{params.X}}`, `{{query.X}}`), resolved against the form's
   * route at submit time; entries whose tokens cannot be resolved are dropped.
   * Used to inherit context (e.g. a parent id from `queryParamFilters`) into a
   * page-rendered "new" form.
   */
  submitDefaults?: Record<string, unknown>;
  /**
   * Opens the form to a contributor: whoever owns the slot rewrites these
   * options — typically by merging in its own fields — as the page layout is
   * served, so a module extending the form long after it was declared is still
   * picked up. See `interfaces/dms/component-slots`.
   */
  slotId?: string;
  /**
   * Field of the loaded row that names it. On a page, the breadcrumb ends
   * with its value ("… › Tasks › Write the docs") once the form has loaded.
   * Table views set it on their edit and details pages from `labelKey`.
   */
  recordLabelKey?: string;
}

export interface FormPropsSerialized extends Omit<FormProps, "fields"> {
  fields: FormFieldOrGroupSerialized[];
  schema?: ReturnType<typeof zodToJsonSchema>;
}

export type FormBuilder = ComponentBuilder<FormPropsSerialized> & {
  readonly fields: FormFieldOrGroup[];
};
