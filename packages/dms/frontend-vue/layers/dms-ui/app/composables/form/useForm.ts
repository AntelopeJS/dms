import type { FormSubmitEvent } from "@nuxt/ui";
import { z } from "zod";
import { unref } from "vue";
import type { FormProps, FormFetchResponse, FormSubmitResponse } from "./types";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { FormEvents } from "./types/events";
import type { FormData, FormFieldValue } from "./types/value";
import type { FormField, FormFieldOrGroup } from "./types/field";
import { isFieldGroup } from "./types/field";
import { resolveResponseToast } from "../../build/utils/responseWarning";
import { processFieldI18n } from "../../build/utils/fieldOptionsI18n";

/** A toast a submit response asks for, on top of the success one. */
interface FormSubmitNotice {
  title: string;
  description?: string;
  /** Toast color; `info` by default. */
  color?: string;
  /** i18n parameters of the texts; a numeric `count` pluralizes them. */
  params?: Record<string, unknown>;
}
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
import {
  type ApiFieldError,
  apiErrorText,
  resolveFieldErrors,
} from "#dms-core/app/composables/useFieldErrors";
import { isBlankValue } from "#dms-core/app/composables/useFormValidation";
import { sameFormValue } from "../../build/composables/unsaved-changes/formValue";

/** A server error shown under its field, translated. */
export interface FormServerFieldError {
  /** The field id. */
  name: string;
  message: string;
  /** The values of the field the error names (addresses of a list…). */
  values?: string[];
  /** The part of the field it names (`address.streetName`), if any. */
  path?: string;
}

export interface UseFormOptions {
  /**
   * Shows server errors under their fields (and focuses the first one): a
   * submit refused for a field never shows a toast. Returns whether any
   * landed on a rendered field; the toast shows otherwise.
   */
  showFieldErrors?: (errors: FormServerFieldError[]) => boolean;
  /**
   * Called once a submit succeeded and the values are the saved ones (or
   * back to the opening ones for an `action` form), before any redirect:
   * the form has nothing unsaved from there on.
   */
  onSaved?: () => void;
}

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

/**
 * Whether a form offers to save: once it has an address and a field someone
 * can fill in, unless its `saveMode` is `none`.
 */
export function formShowsActions(
  options: Pick<FormProps, "saveMode" | "submitUrl">,
  fields: ReadonlyArray<{ disabled?: boolean }>,
): boolean {
  return (
    options.saveMode !== "none" &&
    !!options.submitUrl &&
    !fields.every((field) => field.disabled)
  );
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

/** Where a submit goes, or what it lacks to go anywhere. */
export type SubmitTarget = { url: string } | { missing: "url" | "token" };

/**
 * Where a submit is sent. A form with no URL has nowhere to send it — it is a
 * read-only one — and a URL naming a token the page does not carry, such as an
 * edit form opened without the id of its row, is not a route either: loading
 * already skips such a URL, and submitting to it wrote to a path that was never
 * meant to exist.
 */
export function resolveSubmitTarget(
  submitUrl: string | undefined,
  context: ReplaceUrlVariablesContext,
): SubmitTarget {
  if (!submitUrl) return { missing: "url" };
  const url = replaceUrlVariables(submitUrl, context);
  return url.includes("{{") ? { missing: "token" } : { url };
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

/**
 * The value a cleared field is submitted as: `[]` for a field holding a list
 * (a multiple select, tree, relation, date or file), `null` for any other.
 * The stored value tells which, whatever the control emitted on clearing.
 */
export function clearedFieldValue(initial: unknown): FormFieldValue {
  return Array.isArray(initial) ? [] : null;
}

/** What `collectSubmitData` needs to know of the form besides its values. */
export interface SubmitDataContext {
  /** The values the form loaded (or last saved, or its field defaults). */
  initialValues?: Record<string, unknown>;
  /** Values the form always submits under its fields' (resolved tokens). */
  submitDefaults?: Record<string, unknown>;
  /** Fields a watch action disabled. */
  disabled?: Set<string>;
  /**
   * Send only the fields whose value differs from `initialValues`: an edit of
   * a loaded record must not write back a value someone else changed since.
   */
  onlyChanged?: boolean;
}

/**
 * The body a submit sends.
 *
 * Every field holding a value is sent. A field left `undefined` (a control
 * cleared: a deselected select, an emptied colour, a removed tree pick) is
 * sent too, as its empty value (`clearedFieldValue`), when it started with a
 * value: an endpoint merging the body into the stored row would otherwise
 * keep the value the user removed. A field that started empty and is still
 * empty is not sent, so a create form sends no `null` for the fields nobody
 * touched, nor an edit form for values the row never had. A disabled field
 * is never cleared: the user cannot have emptied it. With `onlyChanged`, a
 * field still holding the value it loaded is left out.
 */
export function collectSubmitData(
  data: Record<string, unknown>,
  fields: ReadonlyArray<Pick<FormField, "id" | "type" | "disabled">>,
  context: SubmitDataContext = {},
): FormData {
  const fieldData: FormData = {};

  for (const field of fields) {
    const value = unref(data[field.id]) as FormFieldValue | undefined;
    const initial = context.initialValues?.[field.id];
    if (context.onlyChanged && sameFormValue(value, initial)) continue;
    if (value !== undefined) {
      fieldData[field.id] = value;
      continue;
    }
    if (field.disabled || context.disabled?.has(field.id)) continue;
    if (isBlankValue(initial, field.type)) continue;
    fieldData[field.id] = clearedFieldValue(initial);
  }

  return {
    ...(context.submitDefaults as FormData | undefined),
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

// A switch always holds a value (off is `false`): it can never be left
// missing, so marking it required would only suggest an action that does not
// exist.
const ALWAYS_FILLED_FIELD_TYPES = new Set(["boolean"]);
// ...unless it is a box to tick: required, it is an agreement ("I accept the
// terms") left missing until ticked.
const ACCEPTANCE_COMPONENTS = new Set(["dms-checkbox"]);

/** Whether a field is a box to tick, which only `true` fills when required. */
export function isAcceptanceField(
  field: Pick<FormField, "type"> & Partial<Pick<FormField, "component">>,
): boolean {
  return (
    !!field.type &&
    ALWAYS_FILLED_FIELD_TYPES.has(field.type) &&
    ACCEPTANCE_COMPONENTS.has(field.component?.componentName ?? "")
  );
}

/**
 * Whether the form marks a field as required: declared so, or made so by a
 * watch action, and neither disabled nor hidden, since `buildValidationSchema`
 * does not validate inactive fields, nor a type that always holds a value.
 */
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

/**
 * The errors of a refused submit the form shows under its fields: only the
 * fields it shows (neither hidden nor disabled) can carry one, anything else
 * is a toast.
 */
export function resolveFormFieldErrors(
  error: unknown,
  fields: ReadonlyArray<Pick<FormField, "id" | "disabled">>,
  inactive: { disabled?: Set<string>; hidden?: Set<string> } = {},
): ApiFieldError[] {
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

export const useForm = (props: FormProps, options: UseFormOptions = {}) => {
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

  // A form that loaded a record and does not create one (a duplicate posts
  // the loaded values as a new row) updates it: only its changes are sent.
  const isRecordUpdate = computed(
    () => !!resolvedFetchUrl.value && props.submitUrlMethod !== HttpMethod.post,
  );

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

  const showSubmitSuccessToast = (response: FormSubmitResponse | undefined) => {
    toast.add(
      resolveResponseToast(
        response,
        {
          title: processI18n("$dms.form.success_title"),
          description: processI18n(
            props.successMessage || "$dms.form.success_message",
          ),
          color: Color.success,
        },
        { processI18n, processApiMessage },
      ),
    );
  };

  const { t } = useI18n();

  // A notice text: an i18n key (`$`) pluralized on a numeric `count` param.
  const noticeText = (value: string, params?: Record<string, unknown>) => {
    if (!value.startsWith("$")) return value;
    const count = params?.count;
    return typeof count === "number"
      ? t(value.slice(1), params ?? {}, count)
      : t(value.slice(1), params ?? {});
  };

  /**
   * A submit response may carry a `notice` the server words for this
   * submission (some of a batch skipped, a partial success): shown as a toast
   * of its own next to the success one.
   */
  const showSubmitNotice = (response: FormSubmitResponse | undefined) => {
    const notice = (response as { notice?: FormSubmitNotice } | undefined)
      ?.notice;
    if (!notice?.title) return;
    toast.add({
      title: noticeText(notice.title, notice.params),
      description: notice.description
        ? noticeText(notice.description, notice.params)
        : undefined,
      color: (notice.color as Color | undefined) ?? Color.info,
    });
  };

  const resolveSubmitErrorDescription = (error: EventError) => {
    if (props.errorMessage) return processI18n(props.errorMessage);
    const text = apiErrorText(error);
    if (text) return processApiMessage(text);
    return processI18n("$dms.form.error_unknown");
  };

  /** Puts a refused submit's field errors under their fields, if any. */
  const showServerFieldErrors = (error: unknown): boolean => {
    if (!options.showFieldErrors) return false;
    const fieldErrors = resolveFormFieldErrors(error, allFields.value, {
      disabled: disabledFields.value,
      hidden: hiddenFields.value,
    });
    if (fieldErrors.length === 0) return false;
    return options.showFieldErrors(
      fieldErrors.map((entry) => ({
        name: entry.field,
        // An error naming values of the field (addresses of a list) lists
        // them: the field shows which ones to fix.
        message: entry.values?.length
          ? t("dms.field_errors.with_values", {
              message: processApiMessage(entry.message),
              values: entry.values.join(", "),
            })
          : processApiMessage(entry.message),
        values: entry.values,
        path: entry.path,
      })),
    );
  };

  const showSubmitErrorToast = (error: EventError) => {
    toast.add({
      title: processI18n("$dms.form.error_title"),
      description: resolveSubmitErrorDescription(error),
      color: Color.error,
    });
  };

  /** Puts every field back to the value it opened with. */
  const restoreInitialValues = (): void => {
    const restored = computeResetState(state.value, initialValues.value);
    Object.assign(
      state.value,
      processBeforeStateMappers(
        restored as FormData,
        props.fields,
        getDataType,
      ),
    );
  };

  const handleSubmitSuccess = async (
    response: FormSubmitResponse | undefined,
    plainData: FormData,
  ) => {
    showSubmitSuccessToast(response);
    showSubmitNotice(response);
    props.onSuccessCallback?.(response, plainData);
    // A form sending something new each time starts over from the values it
    // opened with; any other keeps what it saved as its new starting point.
    if (props.kind === "action") restoreInitialValues();
    else initialValues.value = snapshotFormState(state.value);
    options.onSaved?.();
    if (props.redirectOnSuccess) {
      const target = replaceUrlVariables(
        props.redirectOnSuccess,
        buildUrlContext(response as Record<string, unknown> | undefined),
      );
      await navigateDms(target);
    }
  };

  const showUnresolvedTargetToast = () => {
    toast.add({
      title: processI18n("$dms.form.error_title"),
      description: processI18n("$dms.form.error_no_target"),
      color: Color.error,
    });
  };

  /** Sends a body to the submit URL, through the form's submit events. */
  const sendSubmit = async (
    submitUrl: string,
    body: FormData,
  ): Promise<FormSubmitResponse | undefined> => {
    let submitResponse: FormSubmitResponse | undefined;
    await executeSubmit(
      () =>
        $authFetch<FormSubmitResponse>(submitUrl, {
          method: props.submitUrlMethod || "PUT",
          body,
          headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
        }).then((res) => {
          submitResponse = res;
          return res;
        }),
      {
        startPayload: { data: body },
        successPayload: (response) => ({ data: body, response, submitUrl }),
        errorPayload: (error) => ({
          data: body,
          error: (error as EventError).data || (error as EventError).message,
        }),
      },
    );
    return submitResponse;
  };

  /** A refused save: under its field when it names one, else a toast. */
  const reportSubmitError = (error: unknown): void => {
    if (!showServerFieldErrors(error)) {
      showSubmitErrorToast(error as EventError);
    }
  };

  const onSubmit = async (event: FormSubmitEvent<FormData>) => {
    const target = resolveSubmitTarget(props.submitUrl, buildUrlContext());
    if ("missing" in target) {
      // A read-only form renders no submit button, but Enter in one of its
      // fields still submits it: that does nothing. Falling back on `/` sent
      // the values to the site root with a PUT and reported nothing.
      if (target.missing === "token") showUnresolvedTargetToast();
      return;
    }
    const plainData = collectSubmitData(event.data, allFields.value, {
      initialValues: initialValues.value,
      submitDefaults: effectiveSubmitDefaults.value,
      disabled: disabledFields.value,
      onlyChanged: isRecordUpdate.value,
    });

    loading.value = true;
    try {
      const response = await sendSubmit(target.url, plainData);
      submitSucceeded.value = true;
      await handleSubmitSuccess(response, plainData);
    } catch (error) {
      reportSubmitError(error);
    } finally {
      loading.value = false;
    }
  };

  /**
   * Saves some fields at once, alone (the instant save of a form): sent to
   * `submitUrl` with the form's `submitDefaults`, a cleared field as its
   * empty value, without the success toast of a submit. Rejects when the
   * server refuses them, for the caller to put the values back before
   * `reportSubmitError` says why.
   */
  const submitChanges = async (changes: FormData): Promise<void> => {
    const target = resolveSubmitTarget(props.submitUrl, buildUrlContext());
    if ("missing" in target) {
      showUnresolvedTargetToast();
      throw new Error(`Form submit target: missing ${target.missing}`);
    }
    const changedFields = allFields.value.filter(
      (field) => field.id in changes,
    );
    const body = collectSubmitData(changes, changedFields, {
      initialValues: initialValues.value,
      submitDefaults: effectiveSubmitDefaults.value,
      disabled: disabledFields.value,
    });
    await sendSubmit(target.url, body);
    initialValues.value = {
      ...initialValues.value,
      ...(snapshotFormState(changes) as FormData),
    };
  };

  const reset = (form: FormResetTarget | null): void => {
    form?.clear?.();
    restoreInitialValues();
    sendComponentEvent(FormEvents.RESET, props.componentId, {});
  };

  return {
    loading,
    state,
    initialValues,
    validationSchema,
    onSubmit,
    submitChanges,
    reportSubmitError,
    reset,
    fetchData,
    fields,
    allFields,
    disabledFields,
    hiddenFields,
    requiredFields,
    isFieldGroup,
    submitSucceeded,
    resolvedFetchUrl,
  };
};
