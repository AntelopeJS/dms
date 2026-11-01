import { onScopeDispose } from "vue";
import type {
  FormProps,
  FormFetchResponse,
  FormSubmitResponse,
} from "../../../composables/form/types";
import { FormEvents } from "../../../composables/form/types/events";
import type { FormData } from "../../../composables/form/types/value";
import type { FormFieldOrGroup } from "../../../composables/form/types/field";
import { isFieldGroup } from "../../../composables/form/types/field";
import { processFieldI18n } from "../../utils/fieldOptionsI18n";
import { orderFormEntries } from "./formEntryOrder";
import {
  type ReplaceUrlVariablesContext,
  resolveUrlVariables,
} from "../../utils/urlVariables";
import { apiErrorStatus } from "#dms-core/app/composables/useFieldErrors";
import { HTTP_NOT_FOUND } from "#dms-core/app/utils/http-status";
import { isString } from "#dms-core/app/utils/type-check";
import { sameFormValue } from "../unsaved-changes/formValue";
import {
  type FieldValueComparer,
  buildValidationSchema,
  createBaseValidationSchema,
  createFieldValueComparer,
  flattenFields,
  processBeforeStateMappers,
  resolveSubmitDefaults,
  watchFieldChanges,
  withConditionFields,
} from "./useFormModel";

function createFormState(props: FormProps) {
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

  const lifecycle = { isApplyingSavedRecord: false, isDisposed: false };
  onScopeDispose(() => {
    lifecycle.isDisposed = true;
  });
  watch(
    () => state.value,
    () => {
      if (lifecycle.isApplyingSavedRecord) return;
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

  return {
    props,
    toast,
    $authFetch,
    getDataType,
    isSameFieldValue,
    processI18n,
    processApiMessage,
    route,
    sendComponentEvent,
    executeSubmit,
    loading,
    state,
    initialValues,
    submitSucceeded,
    allFields,
    lifecycle,
    disabledFields,
    hiddenFields,
    requiredFields,
  };
}

/** @internal */
export function createFormFields(props: FormProps) {
  const context = createFormState(props);
  const consumeRefusal = useReadOnlyRefusal();
  const {
    toast,
    $authFetch,
    getDataType,
    processI18n,
    processApiMessage,
    route,
    initialValues,
    disabledFields,
    hiddenFields,
    requiredFields,
  } = context;

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
    if (consumeRefusal(error)) return;
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

  return {
    ...context,
    fields,
    buildUrlContext,
    effectiveSubmitDefaults,
    resolvedFetchUrl,
    isRecordUpdate,
    createsRecord,
    loadRecord,
    fetchData,
    validationSchema,
  };
}
