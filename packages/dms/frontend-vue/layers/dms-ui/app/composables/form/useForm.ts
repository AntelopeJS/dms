import type { FormSubmitEvent } from "@nuxt/ui";
import { z } from "zod";
import { unref } from "vue";
import type { FormProps, FormFetchResponse, FormSubmitResponse } from "./types";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { FormEvents } from "./types/events";
import type { FormData, FormFieldValue } from "./types/value";
import type { FormField, FormFieldOrGroup } from "./types/field";
import { isFieldGroup } from "./types/field";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";

interface FormResetTarget {
  clear?: () => void;
}

const INTERNAL_STATE_KEYS = new Set([
  "disabledFields",
  "hiddenFields",
  "requiredFields",
]);

type ResetStateValues = Record<string, FormFieldValue | undefined>;

export function cloneFormValue(
  value: FormFieldValue | undefined,
): FormFieldValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function computeResetState(
  state: Record<string, unknown>,
  initialValues: FormData,
): ResetStateValues {
  const result: ResetStateValues = {};
  for (const key of Object.keys(state)) {
    if (INTERNAL_STATE_KEYS.has(key)) continue;
    result[key] = cloneFormValue(initialValues[key]);
  }
  return result;
}

export function snapshotFormState(state: Record<string, unknown>): FormData {
  return computeResetState(state, state as FormData) as FormData;
}

function flattenFields(items: FormFieldOrGroup[]): FormField[] {
  const result: FormField[] = [];
  for (const item of items) {
    if (isFieldGroup(item)) {
      result.push(...item.fields);
    } else {
      result.push(item);
    }
  }
  return result;
}

function createBaseValidationSchema(
  schema: unknown,
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

function processFieldI18n(
  field: FormField,
  processI18n: (key: string) => string,
): FormField {
  const opts = field.component.options as ComponentOptionsData | undefined;
  if (!opts) return field;

  const placeholder = isString(opts.placeholder)
    ? processI18n(opts.placeholder)
    : undefined;

  const items = Array.isArray(opts.items)
    ? (opts.items as { label?: string }[]).map((item) => ({
        ...item,
        label: isString(item.label) ? processI18n(item.label) : item.label,
      }))
    : opts.items;

  return {
    ...field,
    component: { ...field.component, options: { ...opts, placeholder, items } },
  };
}

// `{{params.id}}` takes the bare name, which on a route repeating a placeholder
// is its last occurrence — the row id of a form page. The `:<n>` suffix reaches
// a specific occurrence, `{{params.id:1}}` being the id of the page carrying the
// table view (see extractRouteParams).
const PARAM_TOKEN = /\{\{params\.(\w+(?::\d+)?)\}\}/g;

export interface ReplaceUrlVariablesContext {
  routeParams?: Record<string, string>;
  routeQuery: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export function replaceUrlVariables(
  url: string,
  context: ReplaceUrlVariablesContext,
): string {
  let processedUrl = url.replace(
    PARAM_TOKEN,
    (match, key) => context.routeParams?.[key] || match,
  );

  processedUrl = processedUrl.replace(/\{\{query\.(\w+)\}\}/g, (match, key) => {
    const value = context.routeQuery[key];
    return typeof value === "string" ? value : match;
  });

  if (context.response) {
    processedUrl = processedUrl.replace(
      /\{\{response\.(\w+)\}\}/g,
      (match, key) => {
        const value = context.response?.[key];
        return typeof value === "string" || typeof value === "number"
          ? String(value)
          : match;
      },
    );
  }

  return processedUrl;
}

function processBeforeStateMappers(
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

    result[field.id] = dataType.beforeStateMapper(
      result[field.id],
      field.component.options,
    ) as FormFieldValue;
  }

  return result;
}

function collectSubmitData(
  event: FormSubmitEvent<FormData>,
  allFields: FormField[],
  submitDefaults: unknown,
): FormData {
  const fieldData: FormData = {};

  for (const field of allFields) {
    const rawValue = event.data[field.id];
    if (rawValue !== undefined) {
      const unwrappedValue = unref(rawValue);
      if (unwrappedValue !== undefined) {
        fieldData[field.id] = unwrappedValue;
      }
    }
  }

  return {
    ...(submitDefaults as FormData),
    ...fieldData,
  };
}

// `submitDefaults` string values may contain `{{query.X}}` / `{{params.X}}`
// tokens (e.g. a "new" form generated from `queryParamFilters`). Resolve them
// against the current route at submit time; drop entries whose tokens cannot
// be resolved so an unfiltered form doesn't submit a literal `{{...}}`.
export function resolveSubmitDefaults(
  submitDefaults: Record<string, unknown> | undefined,
  context: ReplaceUrlVariablesContext,
): Record<string, unknown> | undefined {
  if (!submitDefaults) return undefined;

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(submitDefaults)) {
    if (typeof value === "string" && value.includes("{{")) {
      const replaced = replaceUrlVariables(value, context);
      if (replaced.includes("{{")) continue;
      resolved[key] = replaced;
    } else {
      resolved[key] = value;
    }
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function makeFieldSchemaRequired(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return makeFieldSchemaRequired(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return makeFieldSchemaRequired(schema.removeDefault());
  }
  // A nullable+optional field round-trips through zod-to-json-schema back to
  // `z.union([<type>, z.null()])`, so unwrap the null branch to reach the base
  // type; otherwise the checks below never apply and clearing the field passes.
  if (schema instanceof z.ZodUnion) {
    const nonNullOptions = schema.options.filter(
      (option: z.ZodTypeAny) => !(option instanceof z.ZodNull),
    );
    if (nonNullOptions.length === 1) {
      return makeFieldSchemaRequired(nonNullOptions[0]);
    }
    return schema;
  }
  if (schema instanceof z.ZodString || schema instanceof z.ZodArray) {
    return schema.min(1);
  }
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

  const newShape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(baseSchema.shape)) {
    const fieldSchema = value as z.ZodTypeAny;
    const isInactive = disabled?.has(key) || hidden?.has(key);
    if (isInactive) {
      newShape[key] = fieldSchema.optional().nullable();
    } else if (required?.has(key)) {
      newShape[key] = makeFieldSchemaRequired(fieldSchema);
    } else {
      newShape[key] = fieldSchema;
    }
  }
  return z.object(newShape).passthrough();
}

function watchFieldChanges(
  state: Ref<Record<string, unknown>>,
  componentId: string | undefined,
  sendComponentEvent: (
    event: string,
    componentId: string,
    payload?: unknown,
  ) => void,
): void {
  if (!componentId) return;
  const previousValuesJson: Record<string, string> = {};

  watch(
    () => state.value,
    (newState) => {
      for (const fieldId of Object.keys(newState)) {
        if (INTERNAL_STATE_KEYS.has(fieldId)) continue;

        let newJson: string;
        try {
          newJson = JSON.stringify(newState[fieldId]);
        } catch {
          newJson = String(newState[fieldId]);
        }
        if (newJson !== previousValuesJson[fieldId]) {
          sendComponentEvent(FormEvents.FIELD_CHANGE, componentId, {
            fieldId,
            value: newState[fieldId],
            formValues: newState,
          });
          previousValuesJson[fieldId] = newJson;
        }
      }
    },
    { deep: true },
  );
}

export const useForm = (props: FormProps) => {
  const toast = useToast();
  const { $authFetch } = useAuthFetch();
  const { getDataType } = useDataTypes();
  const { processI18n, processApiMessage } = useTranslation();
  const route = useDmsRoute();

  const { sendComponentEvent } = useComponentEvent(props.componentId);

  const { execute: executeSubmit } = useEventedAction<FormSubmitResponse>({
    componentId: props.componentId,
    events: {
      start: FormEvents.SUBMIT,
      success: FormEvents.SUBMIT_SUCCESS,
      error: FormEvents.SUBMIT_ERROR,
    },
  });

  const { isLoading: loading, state } = useWatch(
    props.watchActions || [],
    props.componentId,
    {
      disabledFields: new Set<string>(),
      hiddenFields: new Set<string>(),
      requiredFields: new Set<string>(),
    },
  );
  const initialValues = ref<FormData>({});
  const submitSucceeded = ref(false);

  watchFieldChanges(state, props.componentId, sendComponentEvent);

  // A successful submit leaves the form at its saved state; a later edit makes
  // it dirty again, so clear `submitSucceeded` to re-arm the unsaved-changes
  // guard (and the realtime release-on-unmount) for the new edits. Without this
  // the guard would stay permanently disabled after the first save.
  watch(
    () => state.value,
    () => {
      if (submitSucceeded.value) {
        submitSucceeded.value = false;
      }
    },
    { deep: true },
  );

  const allFields = computed(() => flattenFields(props.fields));

  const disabledFields = computed(
    () => state.value.disabledFields as Set<string> | undefined,
  );

  const hiddenFields = computed(
    () => state.value.hiddenFields as Set<string> | undefined,
  );

  const requiredFields = computed(
    () => state.value.requiredFields as Set<string> | undefined,
  );

  const fields = computed<FormFieldOrGroup[]>(() =>
    props.fields.map((item) => {
      if (isFieldGroup(item)) {
        return {
          ...item,
          fields: item.fields.map((f) => processFieldI18n(f, processI18n)),
        };
      }
      return processFieldI18n(item, processI18n);
    }),
  );

  const buildUrlContext = (
    response?: Record<string, unknown>,
  ): ReplaceUrlVariablesContext => ({
    routeParams: props.routeParams,
    routeQuery: route.query as Record<string, unknown>,
    response,
  });

  const effectiveSubmitDefaults = computed(() =>
    resolveSubmitDefaults(props.submitDefaults, buildUrlContext()),
  );

  const resolvedFetchUrl = computed(() => {
    if (!props.fetchUrl) return undefined;
    const url = replaceUrlVariables(props.fetchUrl, buildUrlContext());
    return url.includes("{{") ? undefined : url;
  });

  const fetchData = async () => {
    if (!props.fetchUrl) return undefined;

    try {
      const processedUrl = replaceUrlVariables(
        props.fetchUrl,
        buildUrlContext(),
      );
      if (processedUrl.includes("{{")) return undefined;

      const fetchedData = await $authFetch<FormFetchResponse>(processedUrl, {
        method: props.fetchUrlMethod || "GET",
        headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
      });

      initialValues.value = {
        ...initialValues.value,
        ...JSON.parse(JSON.stringify(fetchedData)),
      };
      return processBeforeStateMappers(fetchedData, props.fields, getDataType);
    } catch (error) {
      showFetchErrorToast(error);
      throw error;
    }
  };

  const showFetchErrorToast = (error: unknown) => {
    const err = error as Error & { data?: string };
    toast.add({
      title: processI18n("$dms.form.fetch_error_title"),
      description: isString(err.data)
        ? processApiMessage(err.data)
        : processI18n("$dms.form.fetch_error_unknown"),
      color: Color.error,
    });
  };

  const baseSchema = createBaseValidationSchema(props.schema);

  const validationSchema = computed(() =>
    buildValidationSchema(
      baseSchema,
      disabledFields.value,
      hiddenFields.value,
      requiredFields.value,
    ),
  );

  const showSubmitSuccessToast = () => {
    toast.add({
      title: processI18n("$dms.form.success_title"),
      description: processI18n(
        props.successMessage || "$dms.form.success_message",
      ),
      color: Color.success,
    });
  };

  const resolveSubmitErrorDescription = (error: EventError) => {
    if (props.errorMessage) return processI18n(props.errorMessage);
    if (isString(error.data)) return processApiMessage(error.data);
    return processI18n("$dms.form.error_unknown");
  };

  const showSubmitErrorToast = (error: EventError) => {
    toast.add({
      title: processI18n("$dms.form.error_title"),
      description: resolveSubmitErrorDescription(error),
      color: Color.error,
    });
  };

  const handleSubmitSuccess = async (
    response: FormSubmitResponse | undefined,
    plainData: FormData,
  ) => {
    showSubmitSuccessToast();
    props.onSuccessCallback?.(response, plainData);
    initialValues.value = snapshotFormState(state.value);
    if (props.redirectOnSuccess) {
      const target = replaceUrlVariables(
        props.redirectOnSuccess,
        buildUrlContext(response as Record<string, unknown> | undefined),
      );
      await navigateDms(target);
    }
  };

  const onSubmit = async (event: FormSubmitEvent<FormData>) => {
    const plainData = collectSubmitData(
      event,
      allFields.value,
      effectiveSubmitDefaults.value,
    );
    const submitUrl = replaceUrlVariables(
      props.submitUrl || "/",
      buildUrlContext(),
    );

    loading.value = true;
    try {
      let submitResponse: FormSubmitResponse | undefined;
      await executeSubmit(
        () =>
          $authFetch<FormSubmitResponse>(submitUrl, {
            method: props.submitUrlMethod || "PUT",
            body: plainData,
            headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
          }).then((res) => {
            submitResponse = res;
            return res;
          }),
        {
          startPayload: { data: plainData },
          successPayload: (response) => ({
            data: plainData,
            response,
            submitUrl,
          }),
          errorPayload: (error) => ({
            data: plainData,
            error: (error as EventError).data || (error as EventError).message,
          }),
        },
      );
      submitSucceeded.value = true;
      await handleSubmitSuccess(submitResponse, plainData);
    } catch (error) {
      showSubmitErrorToast(error as EventError);
    } finally {
      loading.value = false;
    }
  };

  const reset = (form: FormResetTarget | null): void => {
    form?.clear?.();
    const restored = computeResetState(state.value, initialValues.value);
    Object.assign(
      state.value,
      processBeforeStateMappers(
        restored as FormData,
        props.fields,
        getDataType,
      ),
    );
    sendComponentEvent(FormEvents.RESET, props.componentId, {});
  };

  return {
    loading,
    state,
    initialValues,
    validationSchema,
    onSubmit,
    reset,
    fetchData,
    fields,
    allFields,
    disabledFields,
    hiddenFields,
    isFieldGroup,
    submitSucceeded,
    resolvedFetchUrl,
  };
};
