import type { ComponentInfoSerialized } from "../component";
import type { Tone } from "../tones";
import type { DataType } from "./data-type";

/**
 * Valid default values for form fields and columns
 */
export type DefaultValue =
  | string
  | number
  | boolean
  | Date
  | null
  | DefaultValue[];

/** A pill shown beside a read-only field's value. */
export interface FormFieldBadge {
  /** i18n key or literal. */
  label: string;
  tone: Tone;
}

/** A link shown beside a read-only field's value: where it is changed. */
export interface FormFieldLink {
  /** i18n key or literal. */
  label: string;
  /** Takes the page URL tokens (`{{params.X}}`, `{{query.X}}`). */
  to: string;
}

/** A field shown, not edited, with what tells why or where to change it. */
export interface FormFieldReadonly {
  badge?: FormFieldBadge;
  link?: FormFieldLink;
}

/**
 * Holds while another field of the same form holds one of the values `in`
 * lists (a select's or status's value, a boolean; `null` for an empty
 * field), compared as is: `{ field: "stage", in: ["lost"] }`.
 */
export interface FieldCondition {
  field: string;
  in: readonly unknown[];
}

export interface FormField {
  id: string;
  label?: string;
  description?: string;
  /** A grey help line under the control (i18n key or literal). */
  hint?: string;
  type: DataType;
  inputComponent?: ComponentInfoSerialized;
  disabled?: boolean;
  /**
   * The value is shown, not edited: `true`, or with a pill (`badge`) and a
   * link to where it is changed (`link`).
   */
  readonly?: boolean | FormFieldReadonly;
  /**
   * A form creating a record leaves out a read-only field (`disabled` or
   * `readonly`) that holds nothing yet, a value the server sets once the
   * record exists: `true` shows it empty all the same.
   */
  showEmptyOnCreate?: boolean;
  required?: boolean;
  /** The value of a new record: the field starts with it. */
  defaultValue?: DefaultValue;
  /**
   * `defaultValue` is the module's default for a setting, not only a new
   * record's starting value: while the field holds something else, it shows
   * "Module default: X" with "Use default", which puts it back. Off unless
   * set, so a record form (a table view's) never presents a column's initial
   * value as a default the user strayed from.
   */
  offersDefault?: boolean;
  localized?: boolean;
  /**
   * The language a localized field falls back to (its `@Localized`
   * `fallbackLocale`): a value in any language requires one in this one.
   */
  fallbackLocale?: string;
  /**
   * Shown only while the condition holds, from the moment the form opens:
   * hidden, the field is neither required nor sent. A table view's data
   * routes hold to it as well (see `ColumnOptions.visibleWhen`).
   */
  visibleWhen?: FieldCondition;
  /**
   * Shown read-only while the condition holds, from the moment the form
   * opens: its value is not sent. A table view's data routes hold to it as
   * well (see `ColumnOptions.disabledWhen`).
   */
  disabledWhen?: FieldCondition;
}

export interface FormFieldSerialized extends Omit<
  FormField,
  "type" | "inputComponent"
> {
  component: ComponentInfoSerialized;
  type: string;
}
