<script setup lang="ts">
import { pageLink } from "../../build/composables/page/pageUrlValues";
import type { FormProps } from "../../composables/form/types/props";
import type {
  FormData,
  FormFieldValue,
} from "../../composables/form/types/value";
import type { FormField } from "../../composables/form/types/field";
import {
  cloneFormValue,
  fieldValuesOfSubmitDefaults,
  type FormServerFieldError,
  formShowsActions,
  isFieldMarkedRequired,
} from "../../composables/form/useForm";
import {
  FORM_VALIDATOR_KEY,
  type FormValidator,
} from "../../composables/form/types/validation";
import { FORM_FIELD_LOADING_KEY } from "../../composables/form/types/field-loading";
import { FORM_FIELD_SAVED_KEY } from "../../composables/form/types/field-saved";
import {
  FORM_HANDLE_KEY,
  linkedFieldId,
} from "../../build/composables/form/enclosingForm";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../composables/form/types/content-language";
import { DMS_SECTION_SURFACE_KEY } from "../../build/components/section/context";
import DmsSaveBar from "../save-bar/SaveBar.vue";
import { DMS_CONTAINER_KEY } from "../../build/composables/containers/context";
import { useFormDirty } from "../../composables/unsaved-changes/useFormDirty";
import { useUnsavedChanges } from "../../composables/unsaved-changes/useUnsavedChanges";
import { formSaveMode } from "../../build/composables/form/formFooter";
import { usePageRecordLabel } from "#dms-core/app/composables/page/usePageRecordLabel";
import { formatRecordLabel } from "../../build/composables/table-view/utils/formTexts";
import {
  FORM_ENTRY_CONTEXT_KEY,
  fieldErrorPattern,
} from "../../build/composables/form/formEntryContext";
import {
  CONTAINER_LAYOUT_CLASSES,
  FORM_LAYOUT_CLASSES,
  FORM_SURFACE_CLASSES,
  type FormSurface,
  SECTION_LAYOUT_CLASSES,
} from "../../build/composables/form/formLayout";
import { formComponentFocus } from "../../build/composables/form/formComponentFocus";
import { formComponentRealtime } from "../../build/composables/form/formComponentRealtime";
import { formComponentSections } from "../../build/composables/form/formComponentSections";
import {
  formComponentValidation,
  watchFormComponentFieldFlags,
} from "../../build/composables/form/formComponentValidation";
import {
  changedServerErrorFields,
  keptServerErrors,
  serverErrorValue,
  type KeptServerError,
  type PlacedServerError,
} from "../../build/composables/form/serverFieldErrors";
import { useInstantForm } from "../../build/composables/form/useInstantForm";
import { fieldSavedMarker } from "../../build/composables/form/fieldSaved";
import { useInstantSaveHeader } from "#dms-ui/app/composables/layout/useInstantSaveHeader";
import DmsFormEntries from "../../build/components/form/FormEntries.vue";
import DmsFormErrorSummary from "../../build/components/form/FormErrorSummary.vue";
import DmsFormLoadError from "../../build/components/form/FormLoadError.vue";
import {
  type FormRecordLoad,
  missingRecordFailure,
  trackFormRecordLoad,
} from "../../build/composables/form/formRecordLoad";
import DmsFormRequiredLegend from "./FormRequiredLegend.vue";
import DmsFormSections from "../../build/components/form/FormSections.vue";
import { isHiddenOnCreate } from "../../build/composables/form/createFormFields";
import { isString } from "#dms-core/app/utils/type-check";

const props = defineProps<FormProps>();
const form = useTemplateRef("form");

const inFormContainer = inject("dmsFormContainer", false);

const inSection = !inFormContainer && inject(DMS_SECTION_SURFACE_KEY, false);

const hasSections = !!props.sections?.length;
const FormWrapper =
  inFormContainer || inSection || hasSections
    ? "div"
    : resolveComponent("DmsCard");

const { processI18n, processApiMessage } = useTranslation();

const serverErrors = new Map<string, KeptServerError>();

const { focusField, revealField } = formComponentFocus({
  element: () => form.value?.$el,
  loading: () => form.value?.loading,
  fieldIds: () => allFieldIds.value,
});

/**
 * A refused submit: its field errors go under the fields, the first focused.
 *
 * @returns Whether any landed on a field this form renders
 */
function showFieldErrors(errors: FormServerFieldError[]): boolean {
  const target = form.value;
  if (!target) return false;

  if (!isInstant) {
    target.setErrors([]);
    serverErrors.clear();
  }
  for (const error of errors) placeServerError(target, error);
  const shown = errors.filter(
    (error) => target.getErrors(fieldErrorPattern(error.name)).length,
  );
  for (const error of shown) {
    serverErrors.set(error.name, {
      value: serverErrorValue(state.value[error.name]),
      errors: target
        .getErrors(fieldErrorPattern(error.name))
        .map(({ name, message }: PlacedServerError) => ({ name, message })),
    });
  }
  showsErrorSummary.value = shown.length > 0;
  void focusField(target.errors[0]?.name);
  return shown.length > 0;
}

/**
 * Puts a server error under its field, replacing that field's: on the part
 * it names (an address's street) when the field's control declares it, on
 * the whole field otherwise.
 */
function placeServerError(
  target: NonNullable<typeof form.value>,
  error: FormServerFieldError,
): void {
  const scope = fieldErrorPattern(error.name);
  target.setErrors([{ ...error, name: error.path ?? error.name }], scope);
  if (!error.path || target.getErrors(error.path).length) return;
  target.setErrors([error], scope);
}

/** A submit the client-side validation stopped: focus the first bad field. */
function onValidationError(event: { errors: Array<{ name?: string }> }): void {
  showsErrorSummary.value = true;
  void focusField(event.errors[0]?.name);
}

const showsErrorSummary = ref(false);

const {
  loading,
  state,
  initialValues,
  isSameFieldValue,
  validationSchema,
  onSubmit: handleSubmit,
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
} = useForm(props, { showFieldErrors, onSaved: markFormClean });

watch(
  state,
  (current) => {
    for (const name of changedServerErrorFields(serverErrors, current)) {
      serverErrors.delete(name);
      form.value?.clear(fieldErrorPattern(name));
    }
  },
  { deep: true },
);

const validateServerErrors = (current: typeof state.value) =>
  keptServerErrors(serverErrors, current, !!form.value?.loading);

const allFieldIds = computed(() => toValue(allFields).map((field) => field.id));

const showActions = computed(() => formShowsActions(props, toValue(allFields)));
const saveMode = formSaveMode(props.saveMode, props.kind);

const isInstant = saveMode === "instant";

const { localizedSchema, errorNames, clearServerErrors } =
  formComponentValidation({
    validationSchema,
    allFields,
    state,
    isFieldRequired,
    processApiMessage,
    locale: () => locale.value,
    locales: () => locales.value,
    serverErrors,
    clearError: (name) => form.value?.clear(fieldErrorPattern(name)),
    validateControl(fieldId) {
      void form.value?.validate({ name: fieldId, silent: true });
    },
    revalidateChangedField(field) {
      if (!form.value || serverErrors.has(field.id)) return;
      const pattern = fieldErrorPattern(field.id);
      if (!form.value.getErrors(pattern).length) return;
      void form.value.validate({ name: errorNames(field), silent: true });
    },
  });

const { t, locale, locales } = useI18n();

const DEFAULT_SUBMIT_LABEL = createsRecord
  ? "dms.button.create"
  : "dms.button.save_changes";
const submitButtonLabel = computed(() =>
  props.submitLabel ? processI18n(props.submitLabel) : t(DEFAULT_SUBMIT_LABEL),
);

watchFormComponentFieldFlags(disabledFields, () => form.value);
watchFormComponentFieldFlags(hiddenFields, () => form.value);

const container = inject(DMS_CONTAINER_KEY, undefined);
const containerId = props.containerId ?? container?.id;

/** The value of every field, by id: what "unsaved changes" compares. */
function fieldValues(): typeof state.value {
  return Object.fromEntries(
    toValue(allFields).map((field) => [field.id, state.value[field.id]]),
  );
}

const formDirty = useFormDirty(fieldValues);

let isTouched = false;
watch(
  fieldValues,
  () => {
    if (!isTouched) formDirty.markClean();
  },
  { deep: true },
);
const TOUCH_EVENTS = ["pointerdown", "keydown", "input", "paste", "drop"];
function markTouched(): void {
  isTouched = true;
}
onMounted(() => {
  const element = form.value?.$el;
  for (const type of TOUCH_EVENTS) {
    element?.addEventListener?.(type, markTouched, { capture: true });
  }
});

/** The current values become the saved ones: nothing left unsaved. */
function markFormClean(): void {
  isTouched = false;
  showsErrorSummary.value = false;
  clearServerErrors();
  formDirty.markClean();
  instantSave?.start();
}

/** Discard: every field back to the value it opened with. */
function discardChanges(): void {
  reset(form.value);
  markFormClean();
}

const changedFields = computed(() =>
  toValue(allFields).filter(
    (field) =>
      !isSameFieldValue(
        field,
        state.value[field.id],
        formDirty.baseline.value[field.id],
      ),
  ),
);

const canSave = showActions;
const isDirty = computed(
  () => canSave.value && !isInstant && changedFields.value.length > 0,
);

useUnsavedChanges({ dirty: isDirty, containerId, element: form });

const isActionForm = props.kind === "action";

const cameFromAppPage = ref(false);
onMounted(() => {
  cameFromAppPage.value = !!previousAppPage();
});
const canCancel = computed(
  () =>
    inFormContainer || !!container || !!props.backTo || cameFromAppPage.value,
);
const usesSaveBar = saveMode === "bar" && !inFormContainer && !isActionForm;

/** Validates one field alone: whether it holds no error. */
async function isFieldValid(field: FormField): Promise<boolean> {
  await form.value?.validate({ name: errorNames(field), silent: true });
  return !form.value?.getErrors(fieldErrorPattern(field.id)).length;
}

const instantSave = isInstant
  ? useInstantForm({
      state,
      fields: allFields,
      isTouched: () => isTouched,
      isFieldValid,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Instant changes have unknown values while submitChanges accepts FormData. This legacy handoff forwards them without validating or narrowing their contents.
      submit: (changes) => submitChanges(changes as FormData),
      onRefused: reportSubmitError,
    })
  : undefined;

if (instantSave && !inFormContainer && !container) {
  useInstantSaveHeader(() => instantSave.state.value);
}
const hasChangeableFields = computed(() =>
  toValue(allFields).some(
    (field) => !isFieldDisabled(field) && !isFieldHidden(field),
  ),
);

const router = useDmsRouter();
const route = useDmsRoute();
/**
 * The page of the app this one was reached from, which the router records
 * in the history entry: none for a page opened from a link outside the app,
 * a bookmark or a new tab, where going back would leave the app.
 */
function previousAppPage(): string | undefined {
  const back: unknown = window.history.state?.back;
  return isString(back) ? back : undefined;
}

/**
 * Cancel: drops what was changed, then closes the drawer or modal, or leaves
 * a page form for the page of the app the user came from (its list, when
 * opened from one), or its `backTo` when the form was opened directly.
 * Discarding first means leaving never asks about changes the user just chose
 * to drop.
 */
function cancelForm(): void {
  if (isDirty.value) discardChanges();
  if (container) {
    void container.close();
    return;
  }
  if (previousAppPage()) {
    router.back();
    return;
  }
  if (props.backTo) void router.push(pageLink(props.backTo));
}

const validators = new Set<FormValidator>();

function registerValidator(validator: FormValidator): () => void {
  validators.add(validator);
  return () => validators.delete(validator);
}

function runValidators(): boolean {
  for (const validator of validators) {
    if (!validator()) return false;
  }
  return true;
}

const fieldLoadingStates = ref<Map<string, boolean>>(new Map());

function setFieldLoading(id: string, isLoading: boolean): void {
  if (isLoading) {
    fieldLoadingStates.value.set(id, true);
  } else {
    fieldLoadingStates.value.delete(id);
  }
}

const isAnyFieldLoading = computed(() => fieldLoadingStates.value.size > 0);

function onSubmit(event: Parameters<typeof handleSubmit>[0]) {
  if (loadFailure.value || !runValidators()) return;
  handleSubmit(event);
}

provide(FORM_VALIDATOR_KEY, registerValidator);
provide(FORM_HANDLE_KEY, {
  submit: async () => {
    await form.value?.submit();
  },
  registerValidator,
  revealField,
});
provide(FORM_FIELD_LOADING_KEY, setFieldLoading);
provide(
  FORM_FIELD_SAVED_KEY,
  fieldSavedMarker({
    hasField: (id) => toValue(allFields).some((field) => field.id === id),
    initialValues,
    dirty: formDirty,
    instantSave,
  }),
);
provide(FORM_CONTENT_LANGUAGE_KEY, "*");

allFields.value.forEach((field) => {
  if (field.defaultValue === undefined) return;
  state.value[field.id] = cloneFormValue(field.defaultValue);
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- cloneFormValue can return undefined, and defaultValue is reread after the check. This legacy baseline assignment does not prove the narrower field value or validate the JSON clone's result.
  initialValues.value[field.id] = cloneFormValue(
    field.defaultValue,
  ) as FormFieldValue;
});

for (const [id, value] of Object.entries(
  fieldValuesOfSubmitDefaults(allFields.value, effectiveSubmitDefaults.value),
)) {
  state.value[id] = cloneFormValue(value);
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- FormData excludes undefined although submit defaults may contain it; inference and the baseline's owner cannot justify this existing unchecked assignment.
  initialValues.value[id] = cloneFormValue(value) as FormFieldValue;
}

let recordLoad: FormRecordLoad | undefined;
if (props.fetchUrl) {
  const formLoad = await useDmsAsyncData(
    `form-${props.componentId}-${props.pageId}-${resolvedFetchUrl.value ?? ""}`,
    async () => ({
      values: await fetchData(),
      initial: initialValues.value,
    }),
  );

  recordLoad = trackFormRecordLoad(
    formLoad,
    (payload) => {
      if (payload.values && Object.keys(payload.values).length > 0) {
        Object.assign(state.value, payload.values);
      }
      if (payload.initial && payload.initial !== initialValues.value) {
        initialValues.value = { ...initialValues.value, ...payload.initial };
      }
    },
    {
      isEditing: () => changedFields.value.length > 0,
      onReloaded: markFormClean,
    },
  );
}

const loadFailure = computed(
  () =>
    recordLoad?.failure.value ??
    missingRecordFailure({
      requiresRecord: props.requiresRecord,
      fetchUrl: props.fetchUrl,
      resolvedFetchUrl: resolvedFetchUrl.value,
    }),
);
const isRetryingLoad = computed(() => recordLoad?.retrying.value ?? false);

/** Load the record again after a failure; it is what the form starts from. */
async function retryRecordLoad(): Promise<void> {
  await recordLoad?.retry();
  if (!recordLoad?.failure.value) markFormClean();
}

markFormClean();

if (props.labelKey && !inFormContainer) {
  const { setLabel } = usePageRecordLabel();
  const labelKey = props.labelKey;
  onMounted(() => {
    setLabel(
      route.path,
      formatRecordLabel(initialValues.value[labelKey], locale.value),
    );
  });
}

if (!inFormContainer && !container) {
  const followFieldAnchor = () => {
    const fieldId = linkedFieldId(window.location.hash, allFieldIds.value);
    if (fieldId) void revealField(fieldId);
  };
  onMounted(() => {
    followFieldAnchor();
    window.addEventListener("hashchange", followFieldAnchor);
  });
  onBeforeUnmount(() =>
    window.removeEventListener("hashchange", followFieldAnchor),
  );
}

const isHorizontal = props.fieldsOrientation !== "vertical";
const surface: FormSurface = inFormContainer
  ? "container"
  : hasSections
    ? "sections"
    : inSection
      ? "section"
      : "card";
const surfaceClasses = FORM_SURFACE_CLASSES[surface];

const wrapperProps =
  FormWrapper === "div" ? {} : { padded: false, class: "overflow-clip" };

/** Row classes: a section card's, or the form's own orientation's. */
function layoutClasses(inSectionCard: boolean) {
  if ((inSectionCard || inSection) && isHorizontal) {
    return SECTION_LAYOUT_CLASSES;
  }
  const orientation = isHorizontal ? "horizontal" : "vertical";
  return inFormContainer
    ? CONTAINER_LAYOUT_CLASSES[orientation]
    : FORM_LAYOUT_CLASSES[orientation];
}

function isFieldDisabled(field: FormField): boolean {
  if (field.disabled || field.readonly) return true;
  return disabledFields.value?.has(field.id) ?? false;
}

function isFieldHidden(field: FormField): boolean {
  if (hiddenFields.value?.has(field.id)) return true;
  return createsRecord && isHiddenOnCreate(field, state.value[field.id]);
}

function isFieldRequired(field: FormField): boolean {
  return isFieldMarkedRequired(
    field,
    disabledFields.value,
    hiddenFields.value,
    requiredFields.value,
  );
}

const hasRequiredFields = computed(() =>
  toValue(allFields).some(isFieldRequired),
);

provide(FORM_ENTRY_CONTEXT_KEY, {
  state,
  initialValues,
  loading,
  componentId: props.componentId,
  pageId: props.pageId,
  routeParams: props.routeParams,
  layoutClasses,
  isFieldHidden,
  isFieldDisabled,
  isFieldRequired,
  isReadOnly: computed(() => !hasChangeableFields.value),

  showsChanges: !isInstant && !isActionForm && !createsRecord,
  isFieldChanged: (fieldId) => changedFieldIds.value.has(fieldId),
  baselineValue: (fieldId) => formDirty.baseline.value[fieldId],
  fieldSaveState: (fieldId) => instantSave?.states[fieldId] ?? "idle",
  retrySave: () => instantSave?.retry(),
});

const {
  sectionsLayout,
  sectionNav,
  changedFieldIds,
  sectionStates,
  errorSummaryItems,
  changedFieldLabels,
} = formComponentSections({
  props,
  hasSections,
  fields,
  allFieldIds,
  errors: () => form.value?.errors ?? [],
  changedFields,
  isInstant,
  showsErrorSummary,
  usesSaveBar,
  processI18n,
});

const formElementId = `dms-form-${props.componentId}`;
const { showConcurrentEditBanner, handleDiscardAndRefresh, handleKeepEditing } =
  formComponentRealtime({
    resolvedFetchUrl,
    state,
    fetchData,
    submitSucceeded,
    markFormClean,
  });
</script>

<template>
  <component :is="FormWrapper" v-bind="wrapperProps">
    <!-- novalidate: the form words every error itself, under its field; no
      browser bubble from a native required or type="email" control. -->
    <UForm
      :id="formElementId"
      novalidate
      ref="form"
      :state
      :schema="localizedSchema"
      :validate="validateServerErrors"
      :disabled="allFields.every((field) => field.disabled)"
      @submit="onSubmit"
      @error="onValidationError"
    >
      <header v-if="props.title" :class="surfaceClasses.head">
        <h2
          class="text-highlighted text-[17px]/[1.3] font-[650] tracking-[-0.02em]"
        >
          {{ processI18n(props.title) }}
        </h2>
        <p v-if="props.description" class="text-muted mt-0.5 text-[13px]">
          {{ processI18n(props.description) }}
        </p>
      </header>

      <div v-if="loadFailure" :class="surfaceClasses.body">
        <DmsFormLoadError
          :failure="loadFailure"
          :retrying="isRetryingLoad"
          @retry="retryRecordLoad"
        />
      </div>

      <div v-else :class="surfaceClasses.body">
        <UAlert
          v-if="showConcurrentEditBanner"
          color="warning"
          icon="i-ph-warning"
          :title="$t('dms.realtime.concurrent_edit_banner_title')"
          :description="$t('dms.realtime.concurrent_edit_banner_description')"
          :actions="[
            {
              label: $t('dms.realtime.concurrent_edit_banner_discard'),
              color: 'warning',
              onClick: handleDiscardAndRefresh,
            },
            {
              label: $t('dms.realtime.concurrent_edit_banner_keep'),
              variant: 'outline',
              color: 'neutral',
              onClick: handleKeepEditing,
            },
          ]"
          class="mt-4"
        />

        <DmsFormErrorSummary
          v-if="showsErrorSummary"
          :items="errorSummaryItems"
          :class="hasSections ? 'mb-5' : 'mt-4'"
          @select="focusField"
        />

        <DmsFormSections
          v-if="sectionsLayout"
          :layout="sectionsLayout"
          :nav="sectionNav"
          :states="sectionStates"
          :form-id="formElementId"
        >
          <!-- A page form's state is in the page header's pill; a drawer or
            a modal has no header: the side list says it. -->
          <template
            v-if="instantSave && (inFormContainer || container)"
            #nav-footer
          >
            <DmsSaveStatus
              :state="instantSave.state.value"
              class="px-2.5"
              @retry="instantSave.retry"
            />
          </template>
          <DmsFormRequiredLegend
            v-if="hasRequiredFields"
            :class="surfaceClasses.legend"
          />
        </DmsFormSections>
        <template v-else>
          <DmsFormEntries :entries="fields" />
          <DmsFormRequiredLegend
            v-if="hasRequiredFields"
            :class="surfaceClasses.legend"
          />
        </template>
      </div>

      <!-- One bar for every form (see `saveBarState`): the v2 floating bar
        on a page, the footer band of a card, a drawer or a modal. The
        floating bar overlays the form and takes no space while hidden; the
        band holds its place. Neither moves anything when it shows. -->
      <DmsSaveBar
        v-if="canSave && !isInstant && !loadFailure"
        :variant="usesSaveBar ? 'floating' : 'band'"
        :kind="props.kind"
        :dirty="isDirty"
        :saving="loading || isAnyFieldLoading"
        :changes="changedFieldLabels"
        :form="formElementId"
        :save-label="
          usesSaveBar && !createsRecord ? props.submitLabel : submitButtonLabel
        "
        :cancellable="canCancel"
        :resettable="hasChangeableFields"
        :class="usesSaveBar ? 'mx-3' : surfaceClasses.foot"
        @discard="discardChanges"
        @cancel="cancelForm"
      />
    </UForm>
  </component>
</template>
