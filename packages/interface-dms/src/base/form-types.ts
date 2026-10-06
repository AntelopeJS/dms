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

/** How a form offers to save: see `FormProps.saveMode`. */
export const FORM_SAVE_MODES = ["bar", "footer", "none", "instant"] as const;

export type FormSaveMode = (typeof FORM_SAVE_MODES)[number];

/** How a sectioned form lists its sections: see `FormProps.sectionNav`. */
export const FORM_SECTION_NAVS = ["side", "jump", "none"] as const;

export type FormSectionNav = (typeof FORM_SECTION_NAVS)[number];

/**
 * A titled part of a form: one card of fields, reached from the form's
 * section navigation. Every section saves with the rest of the form.
 */
export interface FormSection {
  /** Anchor of the section, unique within the form. */
  id: string;
  /** Title of the section's card and of its entry in the navigation. */
  label: string;
  description?: string;
  /** Icon of the section's entry in the side navigation. */
  icon?: string;
  fields: FormFieldOrGroup[];
}

/** A section as the client reads it: the entries of the form it holds. */
export interface FormSectionSerialized extends Omit<FormSection, "fields"> {
  /** Ids of the entries of the form's `fields` the section holds, in order. */
  fieldIds: string[];
}

/** What a form edits: see `FormProps.kind`. */
export const FORM_KINDS = ["record", "action"] as const;

export type FormKind = (typeof FORM_KINDS)[number];

/** The options `Form` takes. */
export interface FormProps extends BaseComponentProps {
  title?: string;
  description?: string;
  /**
   * The form's fields and groups. Beside `sections`, they come first, outside
   * any section.
   */
  fields?: FormFieldOrGroup[];
  /**
   * The form's fields split into titled cards, on one page and saved together:
   * a navigation leads to each (see `sectionNav`), and marks the sections
   * holding unsaved changes or invalid values.
   */
  sections?: FormSection[];
  /**
   * How a sectioned form lists its sections. `side`: a list beside the
   * sections that follows the scroll (a row of chips on a narrow screen);
   * `jump`: a row of chips above them; `none`: no navigation. Defaults to
   * `side` from three sections, `none` below.
   */
  sectionNav?: FormSectionNav;
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
   * How the form offers to save. `bar` (the default): a sticky bar that shows
   * while there are unsaved changes, names them and offers Discard and Save.
   * `footer`: the buttons in the form's footer. `none`: no buttons, the form
   * is read or saved by something else. `instant` reserves the save-as-you-go
   * of a later release and saves like `bar` for now. In a drawer or a modal,
   * `bar` and `footer` both use the container's footer.
   */
  saveMode?: FormSaveMode;
  /**
   * What the form edits. `record` (the default): a record, a settings page,
   * a table view's form; it keeps its values once saved, and offers Cancel
   * while clean when it has somewhere to go back to (`backTo`, or the drawer
   * or modal it sits in). `action`: a form that does something each time it
   * is sent — send a message, invite someone, run a job; its buttons are
   * Reset and its `submitLabel`, shown once a value changes, and it empties
   * after a successful submit.
   */
  kind?: FormKind;
  /**
   * Where Cancel leads a `record` form placed on a page; without it the form
   * offers no Cancel. Table views set it on their form pages, to the list.
   */
  backTo?: string;
  /**
   * @deprecated Use `saveMode`: `false` is `"none"`, `true` is `"footer"`.
   * Read in 0.4 with a warning.
   */
  showActions?: boolean;
  /**
   * @deprecated Use `saveMode`: `true` is `"bar"`, `false` is `"footer"`.
   * Read in 0.4 with a warning.
   */
  saveBar?: boolean;
  /**
   * @deprecated Use `kind`: `true` is `"record"`, `false` is `"action"`.
   * Read in 0.4 with a warning.
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
   * Table views set it on their edit and details pages from their own
   * `labelKey`.
   */
  labelKey?: string;
}

export interface FormPropsSerialized extends Omit<
  FormProps,
  "fields" | "sections"
> {
  /** Every entry of the form: its own, then each section's. */
  fields: FormFieldOrGroupSerialized[];
  sections?: FormSectionSerialized[];
  schema?: ReturnType<typeof zodToJsonSchema>;
}

export type FormBuilder = ComponentBuilder<FormPropsSerialized> & {
  readonly fields: FormFieldOrGroup[];
};
