import type { FormSubmitEvent } from "@nuxt/ui";
import { nextTick } from "vue";
import type { FormFetchResponse, FormProps, FormSubmitResponse } from "./types";
import { FormEvents } from "./types/events";
import type { FormData, FormFieldValue } from "./types/value";
import { isFieldGroup } from "./types/field";
import { resolveResponseToast } from "../../build/utils/responseWarning";
import { isJsonObject } from "../../build/utils/json";
import { resolveLinkVariables } from "../../build/utils/urlVariables";
import type { I18nTranslate } from "#dms-core/app/composables/translation/useTranslation";
import {
  isNull,
  isNumber,
  isObject,
  isString,
  isUndefined,
} from "#dms-core/app/utils/type-check";
import { isPlainObject } from "../../build/composables/unsaved-changes/formValue";
import { createFormFields } from "../../build/composables/form/formState";
import {
  cloneFormValue,
  collectSubmitData,
  computeResetState,
  processBeforeStateMappers,
  resolveFormFieldErrors,
  resolveSubmitTarget,
  snapshotFormState,
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

/** A toast that a submit response asks for, on top of the success one. */
interface FormSubmitNotice {
  title: string;
  description?: string | null;
  /** Toast color; info by default. */
  color?: string | null;
  /** Translation parameters; a numeric count pluralizes the text. */
  params?: Parameters<I18nTranslate>[1] | null;
}

function isFormSubmitNotice(value: unknown): value is FormSubmitNotice {
  if (!isObject(value) || isNull(value)) return false;
  const { title, description, color, params } = value;
  return (
    isString(title) &&
    [description, color].every(
      (text) => isUndefined(text) || isNull(text) || isString(text),
    ) &&
    (isUndefined(params) || isObject(params))
  );
}

/** What a submit answers: its outcome, and the saved record's fields when the route returns them. */
type FormSubmitAnswer = FormSubmitResponse & FormFetchResponse;

/** The entries of `values` that hold a value, as JSON keeps them. */
function definedValues(
  values: Record<string, FormFieldValue | undefined>,
): FormData {
  const result: FormData = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
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

function createFormNotices(
  context: ReturnType<typeof createFormFields>,
  options: UseFormOptions,
) {
  const presenter = useApiErrorPresenter();
  const {
    props,
    toast,
    processI18n,
    processApiMessage,
    allFields,
    disabledFields,
    hiddenFields,
  } = context;

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
  const showSubmitNotice = (response: FormSubmitAnswer | undefined) => {
    const notice = response?.notice;
    if (!isFormSubmitNotice(notice) || !notice.title) return;
    toast.add({
      title: noticeText(notice.title, notice.params),
      description: notice.description
        ? noticeText(notice.description, notice.params)
        : undefined,
      color: notice.color ?? Color.info,
    });
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
              message: presenter.resolveError(entry.message, {
                fallbackKey: entry.fallbackKey ?? "dms.field_errors.invalid",
                params: entry.params,
              })?.message,
              values: entry.values.join(", "),
            })
          : (presenter.resolveError(entry.message, {
              fallbackKey: entry.fallbackKey ?? "dms.field_errors.invalid",
              params: entry.params,
            })?.message ?? ""),
        values: entry.values,
        path: entry.path,
      })),
    );
  };

  const showSubmitErrorToast = (
    error: Parameters<typeof presenter.presentError>[0],
  ) => {
    presenter.presentError(error, {
      fallbackKey: props.errorMessage || "dms.form.error_unknown",
    });
  };

  return {
    ...context,
    options,
    presenter,
    showSubmitSuccessToast,
    showSubmitNotice,
    showServerFieldErrors,
    showSubmitErrorToast,
  };
}

function createSavedForm(context: ReturnType<typeof createFormNotices>) {
  const {
    props,
    options,
    state,
    initialValues,
    getDataType,
    submitSucceeded,
    lifecycle,
    loadRecord,
    allFields,
  } = context;

  /** Puts every field back to the value it opened with. */
  const restoreInitialValues = (): void => {
    const restored = computeResetState(state.value, initialValues.value);
    Object.assign(state.value, {
      ...restored,
      ...processBeforeStateMappers(
        definedValues(restored),
        props.fields ?? [],
        getDataType,
      ),
    });
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
    lifecycle.isApplyingSavedRecord = true;
    Object.assign(state.value, stored);
    options.onSaved?.();
    await nextTick();
    lifecycle.isApplyingSavedRecord = false;
  };

  /** Re-reads a saved record, keeping intervening edits or failed-read values. */
  const refreshSavedRecord = async (): Promise<void> => {
    let stored: FormData | undefined;
    try {
      stored = await loadRecord();
    } catch {
      return;
    }
    if (lifecycle.isDisposed || !submitSucceeded.value) return;
    if (!stored || Object.keys(stored).length === 0) return;
    await applyStoredRecord(stored);
  };

  /** Uses response fields as the saved record, otherwise re-reads fetchUrl. */
  const showSavedRecord = async (
    response: FormSubmitAnswer | undefined,
  ): Promise<void> => {
    if (!submitSucceeded.value) return;
    const fieldIds = new Set(allFields.value.map((field) => field.id));
    const record: FormData = isPlainObject(response)
      ? Object.fromEntries(
          Object.entries(response).filter(([key]) => fieldIds.has(key)),
        )
      : {};
    if (Object.keys(record).length === 0) return refreshSavedRecord();
    initialValues.value = {
      ...initialValues.value,
      ...definedValues(
        Object.fromEntries(
          Object.entries(record).map(([key, value]) => [
            key,
            cloneFormValue(value),
          ]),
        ),
      ),
    };
    await applyStoredRecord(
      processBeforeStateMappers(record, props.fields ?? [], getDataType),
    );
  };

  return { ...context, restoreInitialValues, markSubmitSaved, showSavedRecord };
}

function createFormSubmission(context: ReturnType<typeof createSavedForm>) {
  const {
    props,
    presenter,
    buildUrlContext,
    showSubmitSuccessToast,
    showSubmitNotice,
    executeSubmit,
    $authFetch,
    showServerFieldErrors,
    showSubmitErrorToast,
  } = context;

  const handleSubmitSuccess = async (
    response: FormSubmitAnswer | undefined,
    plainData: FormData,
  ) => {
    showSubmitSuccessToast(response);
    showSubmitNotice(response);
    props.onSuccessCallback?.(response, plainData);
    if (props.redirectOnSuccess) {
      const target = resolveLinkVariables(
        props.redirectOnSuccess,
        buildUrlContext(isJsonObject(response) ? response : undefined),
      );
      await navigateDms(target);
    }
  };

  const showUnresolvedTargetToast = () => {
    presenter.presentError(null, { fallbackKey: "dms.form.error_no_target" });
  };

  /** Sends through submit events, marking accepted data clean before success. */
  const sendSubmit = async (
    submitUrl: string,
    body: FormData,
    onAccepted?: () => void,
  ): Promise<FormSubmitAnswer | undefined> => {
    let submitResponse: FormSubmitAnswer | undefined;
    await executeSubmit(
      () =>
        $authFetch<FormSubmitAnswer>(submitUrl, {
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
          error: isObject(error) ? error.data || error.message : undefined,
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
      showSubmitErrorToast(error);
    }
  };

  return {
    ...context,
    handleSubmitSuccess,
    showUnresolvedTargetToast,
    sendSubmit,
    reportSubmitError,
  };
}

function createFormActions(context: ReturnType<typeof createFormSubmission>) {
  const {
    props,
    buildUrlContext,
    showUnresolvedTargetToast,
    allFields,
    initialValues,
    effectiveSubmitDefaults,
    disabledFields,
    isRecordUpdate,
    isSameFieldValue,
    loading,
    sendSubmit,
    markSubmitSaved,
    handleSubmitSuccess,
    showSavedRecord,
    reportSubmitError,
    restoreInitialValues,
    sendComponentEvent,
  } = context;

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
  const submitChanges = async (
    changes: Parameters<typeof snapshotFormState>[0],
  ): Promise<void> => {
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

  return { ...context, onSubmit, submitChanges, reset };
}

export const useForm = (props: FormProps, options: UseFormOptions = {}) => {
  const context = createFormActions(
    createFormSubmission(
      createSavedForm(createFormNotices(createFormFields(props), options)),
    ),
  );
  const {
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
    submitSucceeded,
    resolvedFetchUrl,
    createsRecord,
    effectiveSubmitDefaults,
  } = context;

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
