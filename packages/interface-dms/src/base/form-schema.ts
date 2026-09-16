// Building and serializing a form's schema, from its fields, its props or a
// builder.
//
// Split out of form.ts.

import { ComponentBuilder, type ComponentInfoSerialized } from "../component";
import { StampUploadFieldTokens } from "../uploads";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getDataTypeId } from "./data-types/core";
import type { DefaultDataTypes } from "./data-types/default-types";
import type { TreeNode } from "./tree";
import type { AxeOrientation } from "./types";
import { FORM_COMPONENT_NAME } from "./form-block-schema";
export * from "./form-block-schema";
import {
  FormBuilder,
  FormField,
  FormFieldOrGroup,
  FormFieldOrGroupSerialized,
  FormFieldSerialized,
  FormFunctions,
  FormProps,
  FormPropsSerialized,
  isFieldGroup,
} from "./form";
/**
 * Adapts a Zod schema to handle localization and optional/required state
 */
export function adaptFieldValidationSchema(
  baseSchema: z.ZodTypeAny,
  options: { localized?: boolean; required?: boolean },
): z.ZodTypeAny {
  let schema = baseSchema;

  if (options.localized) {
    schema = z.record(z.string(), schema);
  }

  if (!options.required) {
    schema = schema.nullable().optional();
  } else if (schema instanceof z.ZodString) {
    schema = schema.min(1);
  } else if (schema instanceof z.ZodArray) {
    schema = schema.min(1);
  }

  return schema;
}

function addFieldToSchema(
  shape: Record<string, z.ZodTypeAny>,
  field: FormField,
): void {
  const baseSchema = field.type.getValidation();
  shape[field.id] = adaptFieldValidationSchema(baseSchema, {
    localized: field.localized,
    required: field.required,
  });
}

export function buildFormSchema(
  fields: FormFieldOrGroup[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const item of fields) {
    if (isFieldGroup(item)) {
      for (const field of item.fields) {
        addFieldToSchema(shape, field);
      }
    } else {
      addFieldToSchema(shape, item);
    }
  }

  return z.object(shape);
}

const FIELDS_KEY = "fields";

function isFormBuilder(source: unknown): source is FormBuilder {
  return source instanceof ComponentBuilder && FIELDS_KEY in source;
}

function isFormProps(source: unknown): source is FormProps {
  return (
    typeof source === "object" &&
    source !== null &&
    FIELDS_KEY in source &&
    Array.isArray((source as FormProps).fields)
  );
}

export type FormSchemaSource = FormFieldOrGroup[] | FormProps | FormBuilder;

export function formSchema(
  source: FormSchemaSource,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (Array.isArray(source)) return buildFormSchema(source);
  if (isFormBuilder(source)) return buildFormSchema(source.fields);
  if (isFormProps(source)) return buildFormSchema(source.fields);
  throw new Error("formSchema: unsupported source");
}

function serializeField(field: FormField): FormFieldSerialized {
  const typeId = getDataTypeId(field.type) || "unknown";

  return {
    id: field.id,
    label: field.label,
    description: field.description,
    component: field.inputComponent || field.type.inputComponent(),
    disabled: field.disabled,
    type: typeId,
    required: field.required,
    defaultValue: field.defaultValue,
    localized: field.localized,
  };
}

export function serializeFormFields(
  fields: FormFieldOrGroup[],
): FormFieldOrGroupSerialized[] {
  return fields.map((item) => {
    if (isFieldGroup(item)) {
      return {
        id: item.id,
        label: item.label,
        description: item.description,
        fields: item.fields.map(serializeField),
        orientation: item.orientation,
        order: item.order,
      };
    }
    return serializeField(item);
  });
}

export const Form = (options: FormProps): FormBuilder => {
  const schema = buildFormSchema(options.fields);
  const serializedFields = serializeFormFields(options.fields);

  const builder = new ComponentBuilder<FormPropsSerialized>(FORM_COMPONENT_NAME)
    .options({
      ...options,
      fields: serializedFields,
      schema: zodToJsonSchema(schema),
    })
    // The form claims the upload tokens its fields need — its own, and those
    // of the forms embedded in them (a relation's inline add form) — when it
    // serializes: once, at page registration. The page system knows nothing
    // about uploads.
    .transformOptions(StampUploadFieldTokens)
    .meta({
      name: options.title || "Form",
      icon: "i-ph-note-pencil",
    });

  return Object.assign(builder, { fields: options.fields });
};

export namespace FormComponents {
  export interface RichTextOptions {
    placeholder?: string;
  }

  export interface SelectOption {
    label: string;
    value: string | number;
    disabled?: boolean;
    icon?: string;
    iconColor?: string;
    textColor?: string;
  }

  export interface InputEmailOptions {
    placeholder?: string;
  }

  export interface InputColorOptions {
    placeholder?: string;
  }

  export interface InputPasswordOptions {
    placeholder?: string;
    minLength?: number;
    confirmPassword?: boolean;
    confirmPlaceholder?: string;
  }

  export interface InputNumberOptions {
    min?: number;
    max?: number;
    step?: number;
    placeholder?: string;
  }

  export interface InputTimeOptions {
    min?: number;
    max?: number;
    placeholder?: string;
  }

  export interface InputPhoneOptions {
    placeholder?: string;
    requiredPrefix?: boolean;
  }

  export interface InputTextOptions {
    placeholder?: string;
    maxLength?: number;
    minLength?: number;
  }

  export interface RadioGroupOptions {
    items: SelectOption[];
    orientation?: AxeOrientation;
  }

  export interface SelectOptions {
    items: SelectOption[];
    placeholder?: string;
    multiple?: boolean;
    deselectable?: boolean;
  }

  export interface TreeOptions {
    items?: TreeNode[];
    fetchUrl?: string;
    placeholder?: string;
    multiple?: boolean;
  }

  export interface PermissionsTreeNode {
    id: string;
    label: string;
    icon?: string;
    children?: PermissionsTreeNode[];
  }

  export interface PermissionsTreeOptions {
    permissions?: PermissionsTreeNode[];
    fetchUrl?: string;
  }

  export interface RelationOptions {
    placeholder?: string;
    searchUrl: string;
    multiple?: boolean;
    deselectable?: boolean;
    keyMapping?: {
      label?: string;
      value?: string;
      avatar?: string;
      disabled?: string;
    };
    addForm?: ComponentInfoSerialized<FormPropsSerialized>;
    addPermissionId?: string;
  }

  export interface CascaderRelationKeyMapping {
    label: string;
    value: string;
    parent: string;
    disabled?: string;
  }

  export interface CascaderRelationOptions {
    placeholder?: string;
    searchUrl: string;
    multiple?: boolean;
    deselectable?: boolean;
    keyMapping: CascaderRelationKeyMapping;
    maxDepth?: number;
    leafOnly?: boolean;
    fallback?: string;
  }

  export interface SliderOptions {
    min?: number;
    max?: number;
    step?: number;
  }

  export interface TextareaOptions {
    placeholder?: string;
    rows?: number;
    maxLength?: number;
  }

  export interface CalendarOptions {
    range?: boolean;
    multiple?: boolean;
    minDate?: string;
    maxDate?: string;
  }

  export interface DatePickerRangeOptions {
    minDate?: string;
    maxDate?: string;
  }

  export interface AddressOptions {
    placeholder?: {
      streetName?: string;
      houseNumber?: string;
      boxNumber?: string;
      addressLine2?: string;
      postalCode?: string;
      city?: string;
      countrySubdivision?: string;
      countryCode?: string;
    };
    /**
     * Address autocomplete (defaults to the public Photon geocoder when
     * enabled). Set `url` to use a self-hosted / alternative provider.
     */
    autocomplete?: DefaultDataTypes.AddressAutocomplete;
  }

  export interface FileOptions {
    multiple?: boolean;
    constraints?: {
      maxSize?: number;
      allowedMimetypes?: string[];
    };
    path?: string;
    storage?: string;
    attachmentField?: string;
    visibility?: "private" | "public";
  }

  /**
   * Client-side downscaling applied before upload. `cover` crops the image
   * (centered) to the `maxWidth`/`maxHeight` aspect ratio before scaling down,
   * `contain` (default) only scales down while preserving the source ratio.
   * Images already within bounds are uploaded untouched; this is a UX-level
   * bound, not a server-enforced guarantee.
   */
  export interface ImageResizeOptions {
    maxWidth: number;
    maxHeight: number;
    fit?: "cover" | "contain";
  }

  export interface ImageOptions extends FileOptions {
    max?: number;
    resize?: ImageResizeOptions;
  }

  export function InputCheckbox(): ComponentInfoSerialized {
    return new ComponentBuilder<undefined>("dms-checkbox").serializeSync();
  }

  export function InputEmail(
    options?: InputEmailOptions,
  ): ComponentInfoSerialized<InputEmailOptions> {
    return new ComponentBuilder<InputEmailOptions>("dms-input-email")
      .options(options)
      .serializeSync();
  }

  export function InputColor(
    options?: InputColorOptions,
  ): ComponentInfoSerialized<InputColorOptions> {
    return new ComponentBuilder<InputColorOptions>("dms-input-color")
      .options(options)
      .serializeSync();
  }

  export function InputPassword(
    options?: InputPasswordOptions,
  ): ComponentInfoSerialized<InputPasswordOptions> {
    return new ComponentBuilder<InputPasswordOptions>("dms-input-password")
      .options(options)
      .serializeSync();
  }

  export function InputNumber(
    options?: InputNumberOptions,
  ): ComponentInfoSerialized<InputNumberOptions> {
    return new ComponentBuilder<InputNumberOptions>("dms-input-number")
      .options(options)
      .serializeSync();
  }
  export function InputPercentage(
    options?: InputNumberOptions,
  ): ComponentInfoSerialized<InputNumberOptions> {
    return new ComponentBuilder<InputNumberOptions>("dms-input-percentage")
      .options(options)
      .serializeSync();
  }

  export function InputTime(
    options?: InputTimeOptions,
  ): ComponentInfoSerialized<InputTimeOptions> {
    return new ComponentBuilder<InputTimeOptions>("dms-input-time")
      .options(options)
      .serializeSync();
  }

  export function InputText(
    options?: InputTextOptions,
  ): ComponentInfoSerialized<InputTextOptions> {
    return new ComponentBuilder<InputTextOptions>("dms-input-text")
      .options(options)
      .serializeSync();
  }

  export function InputPhone(
    options?: InputPhoneOptions,
  ): ComponentInfoSerialized<InputPhoneOptions> {
    return new ComponentBuilder<InputPhoneOptions>("dms-input-phone")
      .options(options)
      .serializeSync();
  }

  export function InputRadioGroup<T extends RadioGroupOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-radio-group")
      .options(options)
      .serializeSync();
  }

  export function InputSelect<T extends SelectOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-select")
      .options(options)
      .serializeSync();
  }

  export function InputRelation<T extends RelationOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-relation")
      .options(options)
      .serializeSync();
  }

  export function InputCascader<T extends CascaderRelationOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-cascader")
      .options(options)
      .serializeSync();
  }

  export function InputSlider(
    options?: SliderOptions,
  ): ComponentInfoSerialized<SliderOptions> {
    return new ComponentBuilder<SliderOptions>("dms-slider")
      .options(options)
      .serializeSync();
  }

  export function InputSwitch(): ComponentInfoSerialized {
    return new ComponentBuilder<undefined>("dms-switch").serializeSync();
  }

  export function InputTextarea(
    options?: TextareaOptions,
  ): ComponentInfoSerialized<TextareaOptions> {
    return new ComponentBuilder<TextareaOptions>("dms-textarea")
      .options(options)
      .serializeSync();
  }

  export function Calendar(
    options?: CalendarOptions,
  ): ComponentInfoSerialized<CalendarOptions> {
    return new ComponentBuilder<CalendarOptions>("dms-calendar")
      .options(options)
      .serializeSync();
  }

  export function DatePicker(
    options?: CalendarOptions,
  ): ComponentInfoSerialized<CalendarOptions> {
    return new ComponentBuilder<CalendarOptions>("dms-date-picker")
      .options(options)
      .serializeSync();
  }

  export function DatePickerRange(
    options?: DatePickerRangeOptions,
  ): ComponentInfoSerialized<DatePickerRangeOptions> {
    return new ComponentBuilder<DatePickerRangeOptions>("dms-date-picker-range")
      .options(options)
      .serializeSync();
  }

  export function InputTree<T extends TreeOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-input-tree")
      .options(options)
      .serializeSync();
  }

  export function InputAddress<T extends AddressOptions>(
    options?: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-input-address")
      .options(options)
      .serializeSync();
  }

  export function PermissionsTree<T extends PermissionsTreeOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return new ComponentBuilder<T>("dms-permissions-tree")
      .options(options)
      .serializeSync();
  }

  export function RichText(
    options?: RichTextOptions,
  ): ComponentInfoSerialized<RichTextOptions> {
    return new ComponentBuilder<RichTextOptions>("dms-rich-text")
      .options(options)
      .serializeSync();
  }

  export function File(
    options?: FileOptions,
  ): ComponentInfoSerialized<FileOptions> {
    return new ComponentBuilder<FileOptions>("dms-file")
      .options(options)
      .serializeSync();
  }

  export function Image(
    options?: ImageOptions,
  ): ComponentInfoSerialized<ImageOptions> {
    return new ComponentBuilder<ImageOptions>("dms-image")
      .options(options)
      .serializeSync();
  }
}

declare module "./types/watch" {
  interface WatchFunctionParamMap {
    [FormFunctions.SET_FIELD_DISABLED]: {
      targetField: string;
      setDisabled: boolean;
    };
    [FormFunctions.SET_FIELD_HIDDEN]: {
      targetField: string;
      setHidden: boolean;
    };
    [FormFunctions.SET_FIELD_REQUIRED]: {
      targetField: string;
      setRequired: boolean;
    };
  }
}
