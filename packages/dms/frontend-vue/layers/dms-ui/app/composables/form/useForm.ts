import type { FormSubmitEvent } from "@nuxt/ui";
import { nextTick, onScopeDispose } from "vue";
import type { FormProps, FormFetchResponse, FormSubmitResponse } from "./types";
import { FormEvents } from "./types/events";
import type { FormData } from "./types/value";
import type { FormFieldOrGroup } from "./types/field";
import { isFieldGroup } from "./types/field";
import { resolveResponseToast } from "../../build/utils/responseWarning";
import { processFieldI18n } from "../../build/utils/fieldOptionsI18n";
import { orderFormEntries } from "../../build/composables/form/formEntryOrder";
import {
  type ReplaceUrlVariablesContext,
  resolveLinkVariables,
  resolveUrlVariables,
} from "../../build/utils/urlVariables";
import {
  apiErrorStatus,
  apiErrorText,
} from "#dms-core/app/composables/useFieldErrors";
import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import { HTTP_NOT_FOUND } from "#dms-core/app/utils/http-status";
import { isNumber, isString } from "#dms-core/app/utils/type-check";
import {
  isPlainObject,
  sameFormValue,
} from "../../build/composables/unsaved-changes/formValue";
import {
  buildValidationSchema,
  collectSubmitData,
  computeResetState,
  createBaseValidationSchema,
  createFieldValueComparer,
  flattenFields,
  processBeforeStateMappers,
  resolveFormFieldErrors,
  resolveSubmitDefaults,
  resolveSubmitTarget,
  snapshotFormState,
  watchFieldChanges,
  withConditionFields,
} from "../../build/composables/form/useFormModel";

export {
  type ReplaceUrlVariablesContext,
  replaceUrlVariables,
} from "../../build/utils/urlVariables";
export {
  buildValidationSchema,
  clearedFieldValue,
  cloneFormValue,
  collectSubmitData,
  computeResetState,
  createFieldValueComparer,
  fieldValuesOfSubmitDefaults,
  formShowsActions,
  isAcceptanceField,
  isClearedFieldValue,
  isFieldMarkedRequired,
  localizedSubmitValue,
  makeFieldSchemaRequired,
  resolveFormFieldErrors,
  resolveSubmitDefaults,
  resolveSubmitTarget,
  snapshotFormState,
  withConditionFields,
} from "../../build/composables/form/useFormModel";

export type FieldValueComparer =
  import("../../build/composables/form/useFormModel").FieldValueComparer;
export type SubmitDataContext =
  import("../../build/composables/form/useFormModel").SubmitDataContext;
export type SubmitField =
  import("../../build/composables/form/useFormModel").SubmitField;
export type SubmitTarget =
  import("../../build/composables/form/useFormModel").SubmitTarget;

/** A toast a submit response asks for, on top of the success one. */
interface FormSubmitNotice {
  title: string;
  description?: string;
  /** Toast color; info by default. */
  color?: string;
  /** Translation parameters; a numeric count pluralizes the text. */
  params?: Parameters<I18nTranslate>[1];
}

/** A server error shown under its field, translated. */
export interface FormServerFieldError {
  /** The field id. */
  name: string;
  message: string;
  /** The values of the field the error names. */
  values?: string[];
  /** The part of the field it names, if any. */
  path?: string;
}

export interface UseFormOptions {
  /** Shows field errors and returns whether any landed on a rendered field. */
  showFieldErrors?: (errors: FormServerFieldError[]) => boolean;
  /** Runs once saved values are clean, before the success event and redirect. */
  onSaved?: () => void;
}

interface FormResetTarget {
  clear?: () => void;
}

export const useForm = (props: FormProps, options: UseFormOptions = {}) => {
  const toast = useToast();
  const { $authFetch } = useAuthFetch();
  const { getDataType } = useDataTypes();
  const isSameFieldValue = createFieldValueComparer(getDataType);
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

  const allFields = computed(() => flattenFields(props.fields));

  const isStartingValue = (
    fieldId: string,
    value: Parameters<FieldValueComparer>[1],
  ): boolean => {
    const field = allFields.value.find((entry) => entry.id === fieldId);
    const initial = initialValues.value[fieldId];
    return field
      ? isSameFieldValue(field, value, initial)
      : sameFormValue(value, initial);
  };

  watchFieldChanges(
    state,
    props.componentId,
    sendComponentEvent,
    isStartingValue,
  );

  let isApplyingSavedRecord = false;
  let isDisposed = false;
  onScopeDispose(() => {
    isDisposed = true;
  });
  watch(
    () => state.value,
    () => {
      if (isApplyingSavedRecord) return;
      if (submitSucceeded.value) submitSucceeded.value = false;
    },
    { deep: true },
  );

  const inactiveFields = computed(() =>
    withConditionFields(allFields.value, state.value, {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch actions own these sets but expose open state. Preserve the existing unchecked iterable behavior for malformed replacements rather than filtering them.
      disabled: state.value.disabledFields as Set<string> | undefined,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch actions expose open state; keep malformed hidden-field replacements observable to the existing Set constructor.
      hidden: state.value.hiddenFields as Set<string> | undefined,
    }),
  );
  const disabledFields = computed(() => inactiveFields.value.disabled);
  const hiddenFields = computed(() => inactiveFields.value.hidden);
  const requiredFields = computed(
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Watch actions expose open state; retaining this unchecked field preserves existing size/has behavior for malformed replacements.
    () => state.value.requiredFields as Set<string> | undefined,
  );

  const fields = computed<FormFieldOrGroup[]>(() =>
    orderFormEntries(props.fields).map((item) => {
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
    response?: ReplaceUrlVariablesContext["response"],
  ): ReplaceUrlVariablesContext => ({
    routeParams: props.routeParams,
    routeQuery: route.query,
    response,
  });
  const effectiveSubmitDefaults = computed(() =>
    resolveSubmitDefaults(props.submitDefaults, buildUrlContext()),
  );
  const resolvedFetchUrl = computed(() =>
    resolveUrlVariables(props.fetchUrl, buildUrlContext()),
  );
  const isRecordUpdate = computed(
    () => !!resolvedFetchUrl.value && props.submitUrlMethod !== HttpMethod.post,
  );
  const createsRecord = props.kind === "create";

  /** Reads the record at fetchUrl and maps its values for the fields. */
  const loadRecord = async () => {
    if (!props.fetchUrl) return undefined;
    const processedUrl = resolveUrlVariables(props.fetchUrl, buildUrlContext());
    if (processedUrl === undefined) return undefined;
    const fetchedData = await $authFetch<FormFetchResponse>(processedUrl, {
      method: props.fetchUrlMethod || "GET",
      headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
    });
    initialValues.value = {
      ...initialValues.value,
      ...JSON.parse(JSON.stringify(fetchedData)),
    };
    return processBeforeStateMappers(fetchedData, props.fields, getDataType);
  };

  const fetchData = async () => {
    try {
      return await loadRecord();
    } catch (error) {
      if (!import.meta.env.SSR && apiErrorStatus(error) !== HTTP_NOT_FOUND)
        showFetchErrorToast(error);
      throw error;
    }
  };

  const showFetchErrorToast = (error: Parameters<typeof apiErrorStatus>[0]) => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Rejections are arbitrary; keep direct data access, primitive boxing and nullish throws rather than treating this unchecked error projection as validated.
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
  const noticeText = (value: string, params?: FormSubmitNotice["params"]) => {
    if (!value.startsWith("$")) return value;
    const count = params?.count;
    return isNumber(count)
      ? t(value.slice(1), params ?? {}, count)
      : t(value.slice(1), params ?? {});
  };

  /** Shows a server-authored notice next to the ordinary success toast. */
  const showSubmitNotice = (response: FormSubmitResponse | undefined) => {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The response contract omits this optional server extension. Keep the original unchecked title/description behavior for malformed notices instead of validating or dropping them.
    const notice = (response as { notice?: FormSubmitNotice } | undefined)
      ?.notice;
    if (!notice?.title) return;
    toast.add({
      title: noticeText(notice.title, notice.params),
      description: notice.description
        ? noticeText(notice.description, notice.params)
        : undefined,
      color: notice.color ?? Color.info,
    });
  };

  const resolveSubmitErrorDescription = (error: EventError) => {
    if (props.errorMessage) return processI18n(props.errorMessage);
    const text = apiErrorText(error);
    if (text) return processApiMessage(text);
    return processI18n("$dms.form.error_unknown");
  };

  /** Puts a refused submit's field errors under its fields, if any. */
  const showServerFieldErrors = (
    error: Parameters<typeof resolveFormFieldErrors>[0],
  ): boolean => {
    if (!options.showFieldErrors) return false;
    const fieldErrors = resolveFormFieldErrors(error, allFields.value, {
      disabled: disabledFields.value,
      hidden: hiddenFields.value,
    });
    if (fieldErrors.length === 0) return false;
    return options.showFieldErrors(
      fieldErrors.map((entry) => ({
        name: entry.field,
        message: entry.values?.length
          ? t("dms.field_errors.with_values", {
              message: processApiMessage(entry.message, entry.params),
              values: entry.values.join(", "),
            })
          : processApiMessage(entry.message, entry.params),
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
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Reset intentionally carries undefined for initially absent fields. The mapper's nominal FormData contract omits undefined, but no validation or dropping of those fields is intended.
        restored as FormData,
        props.fields,
        getDataType,
      ),
    );
  };

  /** Marks values clean before the accepted submit emits its success event. */
  const markSubmitSaved = (): void => {
    submitSucceeded.value = true;
    if (props.kind === "action") restoreInitialValues();
    else initialValues.value = snapshotFormState(state.value);
    options.onSaved?.();
  };

  /** Applies the saved record without clearing the saved flag in the watcher. */
  const applyStoredRecord = async (stored: FormData): Promise<void> => {
    isApplyingSavedRecord = true;
    Object.assign(state.value, stored);
    options.onSaved?.();
    await nextTick();
    isApplyingSavedRecord = false;
  };

  /** Re-reads a saved record, keeping intervening edits or failed-read values. */
  const refreshSavedRecord = async (): Promise<void> => {
    let stored: FormData | undefined;
    try {
      stored = await loadRecord();
    } catch {
      return;
    }
    if (isDisposed || !submitSucceeded.value) return;
    if (!stored || Object.keys(stored).length === 0) return;
    await applyStoredRecord(stored);
  };

  /** Uses response fields as the saved record, otherwise re-reads fetchUrl. */
  const showSavedRecord = async (
    response: FormSubmitResponse | undefined,
  ): Promise<void> => {
    if (!submitSucceeded.value) return;
    const fieldIds = new Set(allFields.value.map((field) => field.id));
    const record: FormData = isPlainObject(response)
      ? // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Only field names are checked, not values; preserve arbitrary response values at this existing unchecked FormData boundary.
        (Object.fromEntries(
          Object.entries(response).filter(([key]) => fieldIds.has(key)),
        ) as FormData)
      : {};
    if (Object.keys(record).length === 0) return refreshSavedRecord();
    initialValues.value = {
      ...initialValues.value,
      ...JSON.parse(JSON.stringify(record)),
    };
    await applyStoredRecord(
      processBeforeStateMappers(record, props.fields, getDataType),
    );
  };

  const handleSubmitSuccess = async (
    response: FormSubmitResponse | undefined,
    plainData: FormData,
  ) => {
    showSubmitSuccessToast(response);
    showSubmitNotice(response);
    props.onSuccessCallback?.(response, plainData);
    if (props.redirectOnSuccess) {
      const target = resolveLinkVariables(
        props.redirectOnSuccess,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- URL interpolation reads the response's arbitrary keys without validation. The nominal success contract has no index signature; preserve this unchecked projection and malformed runtime responses.
        buildUrlContext(response as ReplaceUrlVariablesContext["response"]),
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

  /** Sends through submit events, marking accepted data clean before success. */
  const sendSubmit = async (
    submitUrl: string,
    body: FormData,
    onAccepted?: () => void,
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
          onAccepted?.();
          return res;
        }),
      {
        startPayload: { data: body },
        successPayload: (response) => ({ data: body, response, submitUrl }),
        errorPayload: (error) => ({
          data: body,
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Evented actions may reject with anything. Retain direct data/message access, fallback ordering and nullish throws rather than narrowing to Error instances.
          error: (error as EventError).data || (error as EventError).message,
        }),
      },
    );
    return submitResponse;
  };

  /** Reports a refused save under its field when possible, otherwise as a toast. */
  const reportSubmitError = (
    error: Parameters<typeof resolveFormFieldErrors>[0],
  ): void => {
    if (!showServerFieldErrors(error)) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Rejection values are passed unchanged to the existing error formatter; there is no Error-instance validation at this boundary.
      showSubmitErrorToast(error as EventError);
    }
  };

  const onSubmit = async (event: FormSubmitEvent<FormData>) => {
    const target = resolveSubmitTarget(props.submitUrl, buildUrlContext());
    if ("missing" in target) {
      if (target.missing === "token") showUnresolvedTargetToast();
      return;
    }
    const plainData = collectSubmitData(event.data, allFields.value, {
      initialValues: initialValues.value,
      submitDefaults: effectiveSubmitDefaults.value,
      disabled: disabledFields.value,
      onlyChanged: isRecordUpdate.value,
      isSameValue: isSameFieldValue,
    });
    loading.value = true;
    try {
      const response = await sendSubmit(target.url, plainData, markSubmitSaved);
      await handleSubmitSuccess(response, plainData);
      if (
        isRecordUpdate.value &&
        props.kind !== "action" &&
        !props.redirectOnSuccess
      )
        await showSavedRecord(response);
    } catch (error) {
      reportSubmitError(error);
    } finally {
      loading.value = false;
    }
  };

  /** Saves only changed fields without success toasts, rejecting refused saves. */
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
      ...snapshotFormState(changes),
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
    isSameFieldValue,
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
    createsRecord,
    effectiveSubmitDefaults,
  };
};
