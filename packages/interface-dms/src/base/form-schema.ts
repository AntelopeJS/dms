// Building and serializing a form's schema, from its fields, its props or a
// builder. The shapes it works on live in `form-types.ts`; both halves are
// re-exported together by `form.ts`, the documented subpath.

import { ComponentBuilder, type ComponentInfoSerialized } from "../component";
import { StampUploadFieldTokens } from "../uploads";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getDataTypeId } from "./data-types/core";
import type { DefaultDataTypes } from "./data-types/default-types";
import type { FormContainerPageTexts } from "./table-view/options";
import type { TreeNode } from "./tree";
import type { AxeOrientation, EnumOption } from "./types";
import { FORM_COMPONENT_NAME } from "./internal/form-block-schema";
import {
  FormBuilder,
  FormField,
  FormFieldOrGroup,
  FormFieldOrGroupSerialized,
  FormFunctions,
  FormProps,
  FormPropsSerialized,
  FormSection,
  FormSectionSerialized,
  isFieldGroup,
} from "./form-types";
import { serializeFormField } from "./internal/form-schema";

export * from "./form-block-schema";
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

const BOOLEAN_TYPE_ID = "boolean";
// Controls a boolean is ticked in rather than switched: required, such a box
// is an agreement ("I accept the terms") only `true` satisfies.
const ACCEPTANCE_COMPONENTS = new Set(["dms-checkbox"]);

/** Whether a field is a box to tick: required, only `true` passes. */
export function isAcceptanceField(field: FormField): boolean {
  if (getDataTypeId(field.type) !== BOOLEAN_TYPE_ID) return false;
  const component = field.inputComponent ?? field.type.inputComponent();
  return ACCEPTANCE_COMPONENTS.has(component.componentName);
}

function addFieldToSchema(
  shape: Record<string, z.ZodTypeAny>,
  field: FormField,
): void {
  const baseSchema =
    field.required && isAcceptanceField(field)
      ? z.literal(true)
      : field.type.getValidation();
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

const SECTIONS_KEY = "sections";

function isFormProps(source: unknown): source is FormProps {
  if (typeof source !== "object" || source === null) return false;
  const props = source as FormProps;
  return (
    (FIELDS_KEY in props && Array.isArray(props.fields)) ||
    (SECTIONS_KEY in props && Array.isArray(props.sections))
  );
}

/** Every entry of a form: its own fields and groups, then each section's. */
export function formEntries(
  options: Pick<FormProps, "fields" | "sections">,
): FormFieldOrGroup[] {
  return [
    ...(options.fields ?? []),
    ...(options.sections ?? []).flatMap((section) => section.fields),
  ];
}

function withoutSections(
  options: FormProps | undefined,
): Omit<FormProps, "sections"> | undefined {
  if (!options) return undefined;
  const { sections: _sections, ...rest } = options;
  return rest;
}

function serializeFormSections(
  sections: FormSection[] | undefined,
): FormSectionSerialized[] | undefined {
  return sections?.map(({ fields, ...section }) => ({
    ...section,
    fieldIds: fields.map((item) => item.id),
  }));
}

export type FormSchemaSource = FormFieldOrGroup[] | FormProps | FormBuilder;

export function formSchema(
  source: FormSchemaSource,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (Array.isArray(source)) return buildFormSchema(source);
  if (isFormBuilder(source)) return buildFormSchema(source.fields);
  if (isFormProps(source)) return buildFormSchema(formEntries(source));
  throw new Error("formSchema: unsupported source");
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
        fields: item.fields.map(serializeFormField),
        orientation: item.orientation,
        order: item.order,
      };
    }
    return serializeFormField(item);
  });
}

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `Form()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 */
export const Form = (options?: FormProps): FormBuilder => {
  const fields = options ? formEntries(options) : [];
  const schema = buildFormSchema(fields);
  const serializedFields = serializeFormFields(fields);

  const builder = new ComponentBuilder<FormPropsSerialized>(FORM_COMPONENT_NAME)
    .options({
      ...withoutSections(options),
      fields: serializedFields,
      ...(options?.sections && {
        sections: serializeFormSections(options.sections),
      }),
      schema: zodToJsonSchema(schema),
    })
    // The form claims the upload tokens its fields need — its own, and those
    // of the forms embedded in them (a relation's inline add form) — when it
    // serializes: once, at page registration. The page system knows nothing
    // about uploads.
    .transformOptions(StampUploadFieldTokens)
    .meta({
      name: options?.title || "Form",
      icon: "i-ph-note-pencil",
    });

  return Object.assign(builder, { fields });
};

export namespace FormComponents {
  export interface RichTextOptions {
    placeholder?: string;
  }

  export interface SelectOption {
    label: string;
    value: string | number;
    /** A line under the label, where the display shows one (cards, radio). */
    description?: string;
    disabled?: boolean;
    icon?: string;
    iconColor?: string;
    textColor?: string;
  }

  /** The text a boolean control shows beside it, or a card's title and body. */
  export interface BooleanControlOptions {
    label?: string;
    description?: string;
  }

  export interface BooleanCardOptions extends BooleanControlOptions {
    icon?: string;
  }

  export interface ChoiceCardsOptions {
    items: SelectOption[];
    multiple?: boolean;
  }

  export interface SegmentedSelectOptions {
    items: SelectOption[];
  }

  /** A field of the rows a repeater edits: one column. */
  export interface RepeaterColumn {
    id: string;
    /** Eyebrow header of the column. */
    label?: string;
    /** Data type id of the field. */
    type?: string;
    component: ComponentInfoSerialized;
    required?: boolean;
  }

  export interface RepeaterOptions {
    columns: RepeaterColumn[];
    /** Rows reordered by a drag handle. */
    sortable?: boolean;
    min?: number;
    max?: number;
    /** Label of the "+ Add …" button (i18n key or literal). */
    addLabel?: string;
  }

  /** The value column of a key-value editor. */
  export interface KeyValueColumn {
    type?: string;
    component: ComponentInfoSerialized;
  }

  export interface KeyValueOptions {
    value: KeyValueColumn;
    /** Each pair has a box turning it on or off. */
    toggleable?: boolean;
    addLabel?: string;
    keyLabel?: string;
    valueLabel?: string;
  }

  export interface SecretOptions {
    revealable?: boolean;
    copyable?: boolean;
    /** POSTed (after a confirmation) to get a new value, `{ value }`. */
    rotateUrl?: string;
    placeholder?: string;
  }

  export interface CopyableTextOptions {
    placeholder?: string;
  }

  /** A suggestion of a code editor's autocomplete. */
  export interface CodeCompletion {
    label: string;
    detail?: string;
    icon?: string;
  }

  export interface CodeOptions {
    language: string;
    lineNumbers?: boolean;
    minLines?: number;
    maxLines?: number;
    /** GET, answering `{ items: CodeCompletion[] }` or a list of them. */
    completionsUrl?: string;
    completions?: CodeCompletion[];
    placeholder?: string;
  }

  export interface TagsOptions {
    itemType?: string;
    max?: number;
    suggestions?: string[];
    placeholder?: string;
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
    orientation?: EnumOption<AxeOrientation>;
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
    /**
     * The `add` permission of each TableView mounted on the related
     * controller: the inline add form posts to their shared `new` route, which
     * any one of them grants.
     */
    addPermissionIds?: string[];
    /**
     * Title and description of the drawer the "add" entry opens.
     * `$`-prefixed: i18n keys.
     */
    addFormTexts?: FormContainerPageTexts;
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

  export function InputCheckbox(
    options?: BooleanControlOptions,
  ): ComponentInfoSerialized<BooleanControlOptions> {
    return new ComponentBuilder<BooleanControlOptions>("dms-checkbox")
      .options(options)
      .serializeSync();
  }

  /** A boolean as a bordered card: an icon, a title and a switch. */
  export function InputBooleanCard(
    options?: BooleanCardOptions,
  ): ComponentInfoSerialized<BooleanCardOptions> {
    return new ComponentBuilder<BooleanCardOptions>("dms-boolean-card")
      .options(options)
      .serializeSync();
  }

  /** The options of a select as cards, one picked or several. */
  export function InputChoiceCards(
    options: ChoiceCardsOptions,
  ): ComponentInfoSerialized<ChoiceCardsOptions> {
    return new ComponentBuilder<ChoiceCardsOptions>("dms-choice-cards")
      .options(options)
      .serializeSync();
  }

  /** The options of a select as segments of one control. */
  export function InputSegmentedSelect(
    options: SegmentedSelectOptions,
  ): ComponentInfoSerialized<SegmentedSelectOptions> {
    return new ComponentBuilder<SegmentedSelectOptions>("dms-segmented-select")
      .options(options)
      .serializeSync();
  }

  /** Rows of fields, added, removed and reordered (`ArrayType`). */
  export function InputRepeater(
    options: RepeaterOptions,
  ): ComponentInfoSerialized<RepeaterOptions> {
    return new ComponentBuilder<RepeaterOptions>("dms-repeater")
      .options(options)
      .serializeSync();
  }

  /** Pairs of a name and a value (`KeyValueType`). */
  export function InputKeyValue(
    options: KeyValueOptions,
  ): ComponentInfoSerialized<KeyValueOptions> {
    return new ComponentBuilder<KeyValueOptions>("dms-key-value")
      .options(options)
      .serializeSync();
  }

  /** A secret, masked until shown (`SecretType`). */
  export function InputSecret(
    options?: SecretOptions,
  ): ComponentInfoSerialized<SecretOptions> {
    return new ComponentBuilder<SecretOptions>("dms-input-secret")
      .options(options)
      .serializeSync();
  }

  /** A read-only value with a copy button (`StringType({ copyable })`). */
  export function InputCopyableText(
    options?: CopyableTextOptions,
  ): ComponentInfoSerialized<CopyableTextOptions> {
    return new ComponentBuilder<CopyableTextOptions>("dms-copyable-text")
      .options(options)
      .serializeSync();
  }

  /** A code editor (`CodeType`). */
  export function InputCode(
    options: CodeOptions,
  ): ComponentInfoSerialized<CodeOptions> {
    return new ComponentBuilder<CodeOptions>("dms-input-code")
      .options(options)
      .serializeSync();
  }

  /** A list of short texts typed as tags (`TagsType`). */
  export function InputTags(
    options?: TagsOptions,
  ): ComponentInfoSerialized<TagsOptions> {
    return new ComponentBuilder<TagsOptions>("dms-input-tags")
      .options(options)
      .serializeSync();
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

  export function InputSwitch(
    options?: BooleanControlOptions,
  ): ComponentInfoSerialized<BooleanControlOptions> {
    return new ComponentBuilder<BooleanControlOptions>("dms-switch")
      .options(options)
      .serializeSync();
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
