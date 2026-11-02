import type { ComponentInfoSerialized } from "../component";
import "../component";
import "../uploads";
import { z } from "zod";
import "zod-to-json-schema";
import { getDataTypeId } from "./data-types/core";
import type { DefaultDataTypes } from "./data-types/default-types";
import type { FormContainerPageTexts } from "./table-view/options";
import type { AxeOrientation, EnumOption } from "./types";
import "./internal/form-block-schema";
import {
  FormBuilder,
  FormField,
  FormFieldOrGroup,
  FormFieldOrGroupSerialized,
  FormFunctions,
  FormProps,
  FormPropsSerialized,
  type SetFieldValueParams,
} from "./form-types";
import {
  createForm,
  formComponent,
  serializeFormEntry,
} from "./internal/form-schema-components";
import {
  buildSchema,
  isFormBuilder,
  isFormProps,
  withFallbackLocale,
} from "./internal/form-schema-validation";

export * from "./form-block-schema";

/** Options of {@link adaptFieldValidationSchema}. */
export interface FieldValidationOptions {
  localized?: boolean;
  required?: boolean;
  /**
   * The language a localized field falls back to: a value holding any
   * language must hold this one, reported on `[fallbackLocale]`.
   */
  fallbackLocale?: string;
}

/**
 * Adapts a Zod schema to handle localization and optional/required state
 */
export function adaptFieldValidationSchema(
  baseSchema: z.ZodTypeAny,
  options: FieldValidationOptions,
): z.ZodTypeAny {
  let schema = baseSchema;

  if (options.localized) {
    schema = z.record(z.string(), schema);
    if (options.fallbackLocale) {
      schema = withFallbackLocale(schema, options.fallbackLocale);
    }
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
const ACCEPTANCE_COMPONENTS = new Set(["dms-checkbox"]);

/** Whether a field is a box to tick: required, only `true` passes. */
export function isAcceptanceField(field: FormField): boolean {
  if (getDataTypeId(field.type) !== BOOLEAN_TYPE_ID) return false;
  const component = field.inputComponent ?? field.type.inputComponent();
  return ACCEPTANCE_COMPONENTS.has(component.componentName);
}

export function buildFormSchema(
  fields: FormFieldOrGroup[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return buildSchema(fields, adaptFieldValidationSchema, isAcceptanceField);
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
  return fields.map(serializeFormEntry);
}

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `Form()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 *
 * @docsApi
 */
export const Form = (options?: FormProps): FormBuilder => {
  const fields = options ? formEntries(options) : [];
  const schema = buildFormSchema(fields);
  const serializedFields = serializeFormFields(fields);

  return createForm(options, fields, schema, serializedFields);
};

export namespace FormComponents {
  /**
   * How wide a single-line input sits in its row. `"compact"` sizes it for a
   * short value (a count, a code: 11rem) from the `sm` breakpoint up, while a
   * phone keeps the full row; `"full"` fills the row. Left out, the input is
   * compact when its bounds keep the value short -- a number whose `min` /
   * `max` fit in 6 digits, a text whose `maxLength` is 16 or less -- and
   * fills the row otherwise.
   */
  export type InputWidth = "compact" | "full";

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
    /**
     * Cards per row once the field is 480px wide (one column below it), so
     * three options sit on one row instead of wrapping 2 + 1. Defaults to 2.
     */
    columns?: number;
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
    /** Unit written after the field ("days"): an i18n key with `$`, or a literal. */
    suffix?: string;
    /**
     * `InputNumber` only. By default (`true`) a value typed outside `min` /
     * `max` is clamped into range when the field loses focus. `false` keeps
     * it as typed and shows "too small" / "too large" under the field, which
     * blocks the submit; the steppers still stop at the bounds.
     */
    clamp?: boolean;
    /** See {@link InputWidth}: `"compact"` for a short number with no `max`. */
    width?: InputWidth;
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
    /** Shows the characters typed, out of `maxLength` when set ("4 / 60"). */
    showCount?: boolean;
    /** See {@link InputWidth}. */
    width?: InputWidth;
    /**
     * How the value reads where it is shown, not edited: a URL as the image
     * it points to (`UrlType`'s `preview`). The input itself ignores it.
     */
    preview?: "avatar" | "image";
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

  /**
   * Narrows a relation picker to the related rows matching another field of
   * the same form: the related table's `field` must equal the form's current
   * value of `from` (a ticket's site among its customer's sites).
   */
  export interface RelationFilterBy {
    /**
     * Field of the related table to match. It must be filterable there
     * (`filterable: true` or `@Filter`): the search route honors only the
     * filters the related controller declares.
     */
    field: string;
    /** Id of the form field whose value the related `field` must equal. */
    from: string;
  }

  export interface RelationOptions {
    placeholder?: string;
    searchUrl: string;
    /**
     * Lists only the related rows matching another field of the form. The
     * picker searches again when that field changes and clears a pick made
     * for its previous value. While it is empty, every row is offered.
     */
    filterBy?: RelationFilterBy;
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
    /** Shows the characters typed, out of `maxLength` when set ("4 / 60"). */
    showCount?: boolean;
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
    /**
     * ISO 3166-1 alpha-2 code shown while the address has no country, and
     * whose places the suggestions list first.
     */
    defaultCountry?: string;
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
    return formComponent("dms-checkbox", options);
  }

  /** A boolean as a bordered card: an icon, a title and a switch. */
  export function InputBooleanCard(
    options?: BooleanCardOptions,
  ): ComponentInfoSerialized<BooleanCardOptions> {
    return formComponent("dms-boolean-card", options);
  }

  /** The options of a select as cards, one picked or several. */
  export function InputChoiceCards(
    options: ChoiceCardsOptions,
  ): ComponentInfoSerialized<ChoiceCardsOptions> {
    return formComponent("dms-choice-cards", options);
  }

  /** The options of a select as segments of one control. */
  export function InputSegmentedSelect(
    options: SegmentedSelectOptions,
  ): ComponentInfoSerialized<SegmentedSelectOptions> {
    return formComponent("dms-segmented-select", options);
  }

  /** Rows of fields, added, removed and reordered (`ArrayType`). */
  export function InputRepeater(
    options: RepeaterOptions,
  ): ComponentInfoSerialized<RepeaterOptions> {
    return formComponent("dms-repeater", options);
  }

  /** Pairs of a name and a value (`KeyValueType`). */
  export function InputKeyValue(
    options: KeyValueOptions,
  ): ComponentInfoSerialized<KeyValueOptions> {
    return formComponent("dms-key-value", options);
  }

  /** A secret, masked until shown (`SecretType`). */
  export function InputSecret(
    options?: SecretOptions,
  ): ComponentInfoSerialized<SecretOptions> {
    return formComponent("dms-input-secret", options);
  }

  /** A read-only value with a copy button (`StringType({ copyable })`). */
  export function InputCopyableText(
    options?: CopyableTextOptions,
  ): ComponentInfoSerialized<CopyableTextOptions> {
    return formComponent("dms-copyable-text", options);
  }

  /** A code editor (`CodeType`). */
  export function InputCode(
    options: CodeOptions,
  ): ComponentInfoSerialized<CodeOptions> {
    return formComponent("dms-input-code", options);
  }

  /** A list of short texts typed as tags (`TagsType`). */
  export function InputTags(
    options?: TagsOptions,
  ): ComponentInfoSerialized<TagsOptions> {
    return formComponent("dms-input-tags", options);
  }

  export function InputEmail(
    options?: InputEmailOptions,
  ): ComponentInfoSerialized<InputEmailOptions> {
    return formComponent("dms-input-email", options);
  }

  export function InputColor(
    options?: InputColorOptions,
  ): ComponentInfoSerialized<InputColorOptions> {
    return formComponent("dms-input-color", options);
  }

  export function InputPassword(
    options?: InputPasswordOptions,
  ): ComponentInfoSerialized<InputPasswordOptions> {
    return formComponent("dms-input-password", options);
  }

  export function InputNumber(
    options?: InputNumberOptions,
  ): ComponentInfoSerialized<InputNumberOptions> {
    return formComponent("dms-input-number", options);
  }
  export function InputPercentage(
    options?: InputNumberOptions,
  ): ComponentInfoSerialized<InputNumberOptions> {
    return formComponent("dms-input-percentage", options);
  }

  export function InputTime(
    options?: InputTimeOptions,
  ): ComponentInfoSerialized<InputTimeOptions> {
    return formComponent("dms-input-time", options);
  }

  export function InputText(
    options?: InputTextOptions,
  ): ComponentInfoSerialized<InputTextOptions> {
    return formComponent("dms-input-text", options);
  }

  export function InputPhone(
    options?: InputPhoneOptions,
  ): ComponentInfoSerialized<InputPhoneOptions> {
    return formComponent("dms-input-phone", options);
  }

  export function InputRadioGroup<T extends RadioGroupOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return formComponent("dms-radio-group", options);
  }

  export function InputSelect<T extends SelectOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return formComponent("dms-select", options);
  }

  export function InputRelation<T extends RelationOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return formComponent("dms-relation", options);
  }

  export function InputCascader<T extends CascaderRelationOptions>(
    options: T,
  ): ComponentInfoSerialized<T> {
    return formComponent("dms-cascader", options);
  }

  export function InputSlider(
    options?: SliderOptions,
  ): ComponentInfoSerialized<SliderOptions> {
    return formComponent("dms-slider", options);
  }

  export function InputSwitch(
    options?: BooleanControlOptions,
  ): ComponentInfoSerialized<BooleanControlOptions> {
    return formComponent("dms-switch", options);
  }

  export function InputTextarea(
    options?: TextareaOptions,
  ): ComponentInfoSerialized<TextareaOptions> {
    return formComponent("dms-textarea", options);
  }

  export function Calendar(
    options?: CalendarOptions,
  ): ComponentInfoSerialized<CalendarOptions> {
    return formComponent("dms-calendar", options);
  }

  export function DatePicker(
    options?: CalendarOptions,
  ): ComponentInfoSerialized<CalendarOptions> {
    return formComponent("dms-date-picker", options);
  }

  export function DatePickerRange(
    options?: DatePickerRangeOptions,
  ): ComponentInfoSerialized<DatePickerRangeOptions> {
    return formComponent("dms-date-picker-range", options);
  }

  export function InputAddress<T extends AddressOptions>(
    options?: T,
  ): ComponentInfoSerialized<T> {
    return formComponent("dms-input-address", options);
  }

  export function RichText(
    options?: RichTextOptions,
  ): ComponentInfoSerialized<RichTextOptions> {
    return formComponent("dms-rich-text", options);
  }

  export function File(
    options?: FileOptions,
  ): ComponentInfoSerialized<FileOptions> {
    return formComponent("dms-file", options);
  }

  export function Image(
    options?: ImageOptions,
  ): ComponentInfoSerialized<ImageOptions> {
    return formComponent("dms-image", options);
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
    [FormFunctions.SET_FIELD_VALUE]: SetFieldValueParams;
  }
}
