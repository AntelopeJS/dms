import { z } from "zod";
import { onMounted, unref } from "vue";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type { FormProps } from "../../../composables/form/types";
import { FormEvents } from "../../../composables/form/types/events";
import type {
  FormData,
  FormFieldValue,
} from "../../../composables/form/types/value";
import type {
  FieldCondition,
  FormField,
  FormFieldOrGroup,
} from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";
import type {
  DataType,
  DataTypeValueComparer,
} from "#dms-core/app/composables/data-types/useDataType";
import type { useWatch } from "#dms-core/app/composables/watch/useWatch";
import type { useComponentEvent } from "#dms-core/app/composables/components/useComponentEvent";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { isBlankValue } from "#dms-core/app/composables/useFormValidation";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import { isPlainObject, sameFormValue } from "../unsaved-changes/formValue";
import { createStartingValueTracker } from "./fieldValueRule";
import {
  type ReplaceUrlVariablesContext,
  hasUrlVariables,
  resolveTextVariables,
  resolveUrlVariables,
} from "../../utils/urlVariables";

type FormState = ReturnType<typeof useWatch>["state"]["value"];
type ResetStateValues = Record<string, FormFieldValue | undefined>;

const INTERNAL_STATE_KEYS = new Set([
  "disabledFields",
  "hiddenFields",
  "requiredFields",
]);

export function cloneFormValue(
  value: FormFieldValue | undefined,
): FormFieldValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/** Whether a form has somewhere to save and an editable field, or is an action. */
export function formShowsActions(
  options: Pick<FormProps, "saveMode" | "submitUrl" | "kind">,
  fields: ReadonlyArray<{ disabled?: boolean }>,
): boolean {
  return (
    options.saveMode !== "none" &&
    !!options.submitUrl &&
    (options.kind === "action" || !fields.every((field) => field.disabled))
  );
}

export function computeResetState(state: FormState, initialValues: FormData) {
  const result: ResetStateValues = {};
  for (const key of Object.keys(state)) {
    if (INTERNAL_STATE_KEYS.has(key)) continue;
    result[key] = cloneFormValue(initialValues[key]);
  }
  return result;
}

export function snapshotFormState(state: FormState): FormData {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch state is deliberately open to plugin values and undefined entries. Snapshotting clones them without validation, preserving the existing FormData API.
  return computeResetState(state, state as FormData) as FormData;
}

export function flattenFields(items: FormFieldOrGroup[]): FormField[] {
  const result: FormField[] = [];
  for (const item of items) {
    if (isFieldGroup(item)) result.push(...item.fields);
    else result.push(item);
  }
  return result;
}

export function createBaseValidationSchema(
  schema: FormProps["schema"],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!schema) return z.object({});
  try {
    const zodCode = jsonSchemaToZod(schema, { module: "none" }).replace(
      /\.strict\(\)$/,
      ".passthrough()",
    );
    return new Function("z", `"use strict"; return (${zodCode})`)(z);
  } catch {
    return z.object({});
  }
}

/** Where a submit goes, or what it lacks to go anywhere. */
export type SubmitTarget = { url: string } | { missing: "url" | "token" };

/** Resolves a submit URL without sending unresolved route tokens. */
export function resolveSubmitTarget(
  submitUrl: string | undefined,
  context: ReplaceUrlVariablesContext,
): SubmitTarget {
  if (!submitUrl) return { missing: "url" };
  const url = resolveUrlVariables(submitUrl, context);
  return url === undefined ? { missing: "token" } : { url };
}

export function processBeforeStateMappers(
  data: FormData,
  fields: FormFieldOrGroup[],
  getDataType: (type: string) => DataType | undefined,
): FormData {
  const result = { ...data };
  const flatFields = flattenFields(fields);
  for (const field of flatFields) {
    if (!field.type || result[field.id] === undefined) continue;
    const dataType = getDataType(field.type);
    if (!dataType?.beforeStateMapper) continue;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Plugin mappers return arbitrary values. Preserve them unchanged rather than imposing FormFieldValue validation at this existing unchecked boundary.
    result[field.id] = dataType.beforeStateMapper(
      result[field.id],
      field.component.options,
    ) as FormFieldValue;
  }
  return result;
}

/** A cleared list submits an empty list; other cleared fields submit null. */
export function clearedFieldValue(
  initial: Parameters<typeof isBlankValue>[0],
): FormFieldValue {
  return Array.isArray(initial) ? [] : null;
}

/** Blank controls are cleared, but arrays and non-Date instances are not. */
export function isClearedFieldValue(
  value: Parameters<typeof isBlankValue>[0],
  type?: string,
): boolean {
  if (Array.isArray(value)) return false;
  const isInstance =
    isObject(value) &&
    value !== null &&
    !(value instanceof Date) &&
    !isPlainObject(value);
  return !isInstance && isBlankValue(value, type);
}

/** Normalizes blank languages while passing through non-localized values. */
export function localizedSubmitValue(
  value: Parameters<typeof isBlankValue>[0],
  type?: string,
) {
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([locale, text]) => [
      locale,
      isString(text) && isBlankValue(text, type) ? "" : text,
    ]),
  );
}

function isClearedField(
  field: SubmitField,
  value: Parameters<typeof isBlankValue>[0],
): boolean {
  if (field.localized) return value === undefined;
  return isClearedFieldValue(value, field.type);
}

function submittedFieldValue(
  field: SubmitField,
  value: Parameters<typeof localizedSubmitValue>[0],
) {
  return field.localized ? localizedSubmitValue(value, field.type) : value;
}

/** A field as collectSubmitData reads it. */
export type SubmitField = Pick<
  FormField,
  "id" | "type" | "disabled" | "localized"
> &
  Partial<Pick<FormField, "component">>;

/** Compares field values under the data-type plugin's open value contract. */
export type FieldValueComparer = (
  field: SubmitField,
  left: Parameters<DataTypeValueComparer>[0],
  right: Parameters<DataTypeValueComparer>[1],
) => boolean;

/** Uses the field's data-type comparator or a deep value comparison. */
export function createFieldValueComparer(
  getDataType: (type: string) => DataType | undefined,
): FieldValueComparer {
  return (field, left, right) => {
    const compare = field.type
      ? getDataType(field.type)?.isSameValue
      : undefined;
    return compare
      ? compare(left, right, field.component?.options)
      : sameFormValue(left, right);
  };
}

const defaultFieldValueComparer: FieldValueComparer = (_field, left, right) =>
  sameFormValue(left, right);

/** The form context for collecting a submit body. */
export interface SubmitDataContext {
  /** Loaded values, last saved values, or field defaults. */
  initialValues?: FormState;
  /** Values submitted even when they have no rendered field. */
  submitDefaults?: FormProps["submitDefaults"];
  /** Fields disabled by watch actions. */
  disabled?: Set<string>;
  /** Leaves unchanged fields out of a record update. */
  onlyChanged?: boolean;
  /** The field's comparator, or deep comparison by default. */
  isSameValue?: FieldValueComparer;
}

/** Collects populated fields and explicit clears, omitting untouched empty fields. */
export function collectSubmitData(
  data: FormState,
  fields: ReadonlyArray<SubmitField>,
  context: SubmitDataContext = {},
): FormData {
  const fieldData: FormData = {};
  const isSameValue = context.isSameValue ?? defaultFieldValueComparer;
  for (const field of fields) {
    const value = unref(data[field.id]);
    const initial = context.initialValues?.[field.id];
    if (context.onlyChanged && isSameValue(field, value, initial)) continue;
    if (!isClearedField(field, value)) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Submission intentionally passes arbitrary populated plugin values through; validating against FormFieldValue would change accepted payloads.
      fieldData[field.id] = submittedFieldValue(field, value) as FormFieldValue;
      continue;
    }
    if (field.disabled || context.disabled?.has(field.id)) continue;
    if (isBlankValue(initial, field.type)) continue;
    fieldData[field.id] = clearedFieldValue(initial);
  }
  return {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Submit defaults are an open prop contract and are merged without validation, including malformed runtime values.
    ...(context.submitDefaults as FormData | undefined),
    ...fieldData,
  };
}

export function resolveSubmitDefaults(
  submitDefaults: FormProps["submitDefaults"],
  context: ReplaceUrlVariablesContext,
): FormProps["submitDefaults"] {
  if (!submitDefaults) return undefined;
  const resolved: NonNullable<FormProps["submitDefaults"]> = {};
  for (const [key, value] of Object.entries(submitDefaults)) {
    if (isString(value) && hasUrlVariables(value)) {
      const replaced = resolveTextVariables(value, context);
      if (replaced === undefined) continue;
      resolved[key] = replaced;
    } else resolved[key] = value;
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/** Initializes fields found among submit defaults, leaving extra defaults submit-only. */
export function fieldValuesOfSubmitDefaults(
  fields: ReadonlyArray<{ id: string }>,
  submitDefaults: FormProps["submitDefaults"],
): FormData {
  const values: FormData = {};
  if (!submitDefaults) return values;
  for (const { id } of fields) {
    if (id in submitDefaults) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The open submit-default prop is copied unchanged into fields, including values outside the nominal FormFieldValue union.
      values[id] = submitDefaults[id] as FormFieldValue;
    }
  }
  return values;
}

export function makeFieldSchemaRequired(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return makeFieldSchemaRequired(schema.unwrap());
  if (schema instanceof z.ZodDefault)
    return makeFieldSchemaRequired(schema.removeDefault());
  if (schema instanceof z.ZodUnion) {
    const nonNullOptions = schema.options.filter(
      (option: z.ZodTypeAny) => !(option instanceof z.ZodNull),
    );
    if (nonNullOptions.length === 1)
      return makeFieldSchemaRequired(nonNullOptions[0]);
    return schema;
  }
  if (schema instanceof z.ZodString || schema instanceof z.ZodArray)
    return schema.min(1);
  return schema;
}

export function buildValidationSchema(
  baseSchema: z.ZodObject<Record<string, z.ZodTypeAny>>,
  disabled: Set<string> | undefined,
  hidden: Set<string> | undefined,
  required: Set<string> | undefined,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const hasInactive =
    (disabled && disabled.size > 0) || (hidden && hidden.size > 0);
  const hasRequired = required && required.size > 0;
  if (!hasInactive && !hasRequired) return baseSchema;
  const fieldSchemas: Record<string, z.ZodTypeAny> = {};
  for (const [key, fieldSchema] of Object.entries(baseSchema.shape)) {
    const isInactive = disabled?.has(key) || hidden?.has(key);
    if (isInactive) fieldSchemas[key] = fieldSchema.optional().nullable();
    else if (required?.has(key))
      fieldSchemas[key] = makeFieldSchemaRequired(fieldSchema);
    else fieldSchemas[key] = fieldSchema;
  }
  return z.object(fieldSchemas).passthrough();
}

const ALWAYS_FILLED_FIELD_TYPES = new Set(["boolean"]);
const ACCEPTANCE_COMPONENTS = new Set(["dms-checkbox"]);

/** Whether a field is a required checkbox that only true fills. */
export function isAcceptanceField(
  field: Pick<FormField, "type"> & Partial<Pick<FormField, "component">>,
): boolean {
  return (
    !!field.type &&
    ALWAYS_FILLED_FIELD_TYPES.has(field.type) &&
    ACCEPTANCE_COMPONENTS.has(field.component?.componentName ?? "")
  );
}

/** Whether an active, editable field carries its required marker. */
export function isFieldMarkedRequired(
  field: Pick<FormField, "id" | "required" | "disabled" | "type"> &
    Partial<Pick<FormField, "component" | "readonly">>,
  disabled: Set<string> | undefined,
  hidden: Set<string> | undefined,
  required: Set<string> | undefined,
): boolean {
  if (field.disabled || field.readonly) return false;
  if (disabled?.has(field.id) || hidden?.has(field.id)) return false;
  const isAlwaysFilled =
    !!field.type && ALWAYS_FILLED_FIELD_TYPES.has(field.type);
  if (isAlwaysFilled && !isAcceptanceField(field)) return false;
  return !!field.required || (required?.has(field.id) ?? false);
}

const meetsCondition = (
  condition: FieldCondition,
  values: FormState,
): boolean => condition.in.includes(values[condition.field] ?? null);

/** Combines watch-driven inactive fields with the conditions on current values. */
export function withConditionFields(
  fields: ReadonlyArray<Pick<FormField, "id" | "visibleWhen" | "disabledWhen">>,
  values: FormState,
  watched: { disabled?: Set<string>; hidden?: Set<string> },
) {
  const disabled = new Set(watched.disabled);
  const hidden = new Set(watched.hidden);
  for (const field of fields) {
    if (field.visibleWhen && !meetsCondition(field.visibleWhen, values))
      hidden.add(field.id);
    if (field.disabledWhen && meetsCondition(field.disabledWhen, values))
      disabled.add(field.id);
  }
  return { disabled, hidden };
}

export function watchFieldChanges(
  state: Ref<FormState>,
  componentId: string | undefined,
  sendComponentEvent: ReturnType<
    typeof useComponentEvent
  >["sendComponentEvent"],
  isStartingValue: Parameters<typeof createStartingValueTracker>[0],
): void {
  if (!componentId) return;
  const id = componentId;
  const previousValuesJson: Record<string, string> = {};
  const isInitial = createStartingValueTracker(isStartingValue);
  onMounted(() => {
    watch(() => state.value, sendChanges, { deep: true, immediate: true });
  });
  function sendChanges(newState: FormState): void {
    for (const fieldId of Object.keys(newState)) {
      if (INTERNAL_STATE_KEYS.has(fieldId)) continue;
      let newJson: string;
      try {
        newJson = JSON.stringify(newState[fieldId]);
      } catch {
        newJson = String(newState[fieldId]);
      }
      if (newJson !== previousValuesJson[fieldId]) {
        sendComponentEvent(FormEvents.FIELD_CHANGE, id, {
          fieldId,
          value: newState[fieldId],
          formValues: newState,
          initial: isInitial(fieldId, newState[fieldId]),
        });
        previousValuesJson[fieldId] = newJson;
      }
    }
  }
}

/** Keeps refused-submit field errors only for active rendered fields. */
export function resolveFormFieldErrors(
  error: Parameters<typeof resolveFieldErrors>[0],
  fields: ReadonlyArray<Pick<FormField, "id" | "disabled">>,
  inactive: { disabled?: Set<string>; hidden?: Set<string> } = {},
) {
  const shown = fields
    .filter(
      (field) =>
        !field.disabled &&
        !inactive.disabled?.has(field.id) &&
        !inactive.hidden?.has(field.id),
    )
    .map((field) => field.id);
  return resolveFieldErrors(error, { fields: shown }).fields;
}
