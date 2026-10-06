<script setup lang="ts">
import type { FormProps } from "../../composables/form/types/props";
import type { FormFieldValue } from "../../composables/form/types/value";
import type { FormField } from "../../composables/form/types/field";
import {
  cloneFormValue,
  type FormServerFieldError,
  formShowsActions,
  isAcceptanceField,
  isFieldMarkedRequired,
} from "../../composables/form/useForm";
import {
  FORM_VALIDATOR_KEY,
  type FormValidator,
} from "../../composables/form/types/validation";
import { FORM_FIELD_LOADING_KEY } from "../../composables/form/types/field-loading";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../composables/form/types/content-language";
import { DMS_SECTION_SURFACE_KEY } from "../section/context";
import DmsSaveBar from "../save-bar/SaveBar.vue";
import type { ZodErrorMap } from "zod";
import {
  formIssueMessage,
  REQUIRED_MESSAGE,
} from "#dms-core/app/composables/useFormValidation";
import { validateFormState } from "../../composables/form/formValidation";
import { DMS_CONTAINER_KEY } from "../../composables/containers/context";
import { sameFormValue } from "../../composables/unsaved-changes/formValue";
import { useFormDirty } from "../../composables/unsaved-changes/useFormDirty";
import { useUnsavedChanges } from "../../composables/unsaved-changes/useUnsavedChanges";
import {
  actionFormShowsButtons,
  formSaveMode,
} from "../../composables/form/formFooter";
import { usePageRecordLabel } from "#dms-core/app/composables/page/usePageRecordLabel";
import { formatRecordLabel } from "../../build/composables/table-view/utils/formTexts";
import {
  FORM_ENTRY_CONTEXT_KEY,
  fieldErrorPattern,
} from "../../build/composables/form/formEntryContext";
import {
  FORM_LAYOUT_CLASSES,
  FORM_SURFACE_CLASSES,
  type FormSurface,
  SECTION_LAYOUT_CLASSES,
} from "../../build/composables/form/formLayout";
import {
  entryFieldIds,
  errorFieldId,
  invalidFieldIds,
  layoutSections,
  type FormSectionState,
  resolveSectionNav,
  sectionState,
} from "../../build/composables/form/formSections";
import { FORM_CONTROL_ERRORS_KEY } from "../../build/composables/form/useControlError";
import DmsFormEntries from "../../build/components/form/FormEntries.vue";
import DmsFormErrorSummary from "../../build/components/form/FormErrorSummary.vue";
import DmsFormSections from "../../build/components/form/FormSections.vue";

const REALTIME_PRESENCE_FLAG = "_presence=1";
const REALTIME_ACQUIRE_PATH = "/api/realtime/acquire";
const REALTIME_RELEASE_PATH = "/api/realtime/release";
const REALTIME_PRESENCE_TOPIC_PREFIX = "tableview:presence:";
const REALTIME_ROW_TOPIC_PREFIX = "tableview:row:";
const REALTIME_GET_SEGMENT = "/get";
const REALTIME_EVENT_UPDATED = "updated";

const props = defineProps<FormProps>();
const form = useTemplateRef("form");

// Inside a DynamicModal/DynamicDrawer the container already provides the
// surface, so skip the DmsCard wrapper to avoid a nested, detached card.
const inFormContainer = inject("dmsFormContainer", false);
// Inside a framed DmsSection the section card is the surface: the fields
// become its rows (v2 .st-row) instead of a card nested in a card.
const inSection = !inFormContainer && inject(DMS_SECTION_SURFACE_KEY, false);
// A sectioned form is no card either: each of its sections is one.
const hasSections = !!props.sections?.length;
const FormWrapper =
  inFormContainer || inSection || hasSections
    ? "div"
    : resolveComponent("DmsCard");

const { processI18n, processApiMessage } = useTranslation();

// Server errors stay on their field until its value changes (UForm only
// re-validates a field once it was left, and its schema knows nothing of
// them): the value each field's were raised against, by field id.
const serverErrorValues = new Map<string, string>();

/** The control of a field, by its id, inside this form only. */
function fieldControl(name: string | undefined): HTMLElement | null {
  const element = form.value?.$el as HTMLElement | undefined;
  if (!name || !element?.querySelector) return null;
  return element.querySelector<HTMLElement>(`[id="${CSS.escape(name)}"]`);
}

/** The names a field's errors go under: its own, and one per language. */
function errorNames(field: FormField): string[] {
  if (!field.localized) return [field.id];
  return [field.id, ...locales.value.map((lang) => `${field.id}.${lang.code}`)];
}

// Where a keyboard user starts in a composite control: a calendar's current
// day (the one cell of its grid in the tab order), not the year buttons
// above the grid.
const PREFERRED_FOCUS =
  "[data-reka-calendar-cell-trigger][tabindex='0'], [role='grid'] [tabindex='0']";
const FOCUSABLE =
  "input:not([type='hidden']):not([disabled]):not([tabindex='-1']), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1'])";

/** The row of a field (its `UFormField`), by the name it validates under. */
function fieldRow(name: string | undefined): HTMLElement | null {
  const element = form.value?.$el as HTMLElement | undefined;
  if (!name || !element?.querySelector) return null;
  return element.querySelector<HTMLElement>(
    `[data-field="${CSS.escape(name)}"]`,
  );
}

/**
 * Resolves once UForm is done with a submit: while it validates, it disables
 * every control, and a disabled control cannot take focus.
 */
async function formSettled(): Promise<void> {
  await nextTick();
  if (!form.value?.loading) return;
  await new Promise<void>((resolve) => {
    const stop = watch(
      () => form.value?.loading,
      (busy) => {
        if (busy) return;
        stop();
        resolve();
      },
    );
  });
  await nextTick();
}

/**
 * Focuses the control an error names (the part of a field it names, or the
 * field), or its first focusable part (a pill group, a picker trigger); a
 * field with nothing to focus is scrolled into view.
 */
async function focusField(name: string | undefined): Promise<void> {
  await formSettled();
  const fieldId = errorFieldId(name, allFieldIds.value) ?? name;
  const control = fieldControl(name) ?? fieldControl(fieldId);
  const row = fieldRow(fieldId);
  const target = control?.matches(FOCUSABLE)
    ? control
    : (control?.querySelector<HTMLElement>(PREFERRED_FOCUS) ??
      control?.querySelector<HTMLElement>(FOCUSABLE) ??
      row?.querySelector<HTMLElement>(FOCUSABLE));
  if (target) {
    target.focus();
    return;
  }
  row?.scrollIntoView({ block: "center" });
}

/**
 * A refused submit: its field errors go under the fields, the first focused.
 *
 * @returns Whether any landed on a field this form renders
 */
function showFieldErrors(errors: FormServerFieldError[]): boolean {
  const target = form.value;
  if (!target) return false;
  // An error naming a part of its field (an address's street) goes on the
  // part when the field's control declares it, on the whole field otherwise.
  const located = errors.map((error) => ({
    ...error,
    name: error.path ?? error.name,
  }));
  target.setErrors(located);
  target.setErrors(
    located.map((error, index) =>
      target.getErrors(error.name).length
        ? error
        : { ...error, name: errors[index]!.name },
    ),
  );
  const shown = errors.filter(
    (error) => target.getErrors(fieldErrorPattern(error.name)).length,
  );
  serverErrorValues.clear();
  for (const error of shown) {
    serverErrorValues.set(error.name, JSON.stringify(state.value[error.name]));
  }
  showsErrorSummary.value = shown.length > 0;
  void focusField(target.errors[0]?.name);
  return shown.length > 0;
}

/** A submit the client-side validation stopped: focus the first bad field. */
function onValidationError(event: { errors: Array<{ name?: string }> }): void {
  showsErrorSummary.value = true;
  void focusField(event.errors[0]?.name);
}

// Once a submit is refused, the form lists what to fix above its fields
// until it is saved.
const showsErrorSummary = ref(false);

const {
  loading,
  state,
  initialValues,
  validationSchema,
  onSubmit: handleSubmit,
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
} = useForm(props, { showFieldErrors, onSaved: markFormClean });

watch(
  state,
  (current) => {
    for (const [name, value] of serverErrorValues) {
      if (JSON.stringify(current[name]) === value) continue;
      serverErrorValues.delete(name);
      form.value?.clear(fieldErrorPattern(name));
    }
  },
  { deep: true },
);

const allFieldIds = computed(() => toValue(allFields).map((field) => field.id));

const showActions = computed(() => formShowsActions(props, toValue(allFields)));
const saveMode = formSaveMode(props.saveMode);

// zod words its own messages in English ("String must contain at least 1
// character(s)"): the issues a schema leaves unworded get the dashboard's.
// A part left blank (an address's country) is missing, whatever its type
// would say of a short or absent value: worded as the hand-built forms do.
const issueErrorMap: ZodErrorMap = (issue, context) => ({
  message: processApiMessage(formIssueMessage(issue, context.data)),
});

/**
 * The validation schema, as a Standard Schema validating with that map: a
 * required field left empty, whatever its type, gets the one "required"
 * message (see `validateFormState`).
 */
const localizedSchema = computed(() => {
  const schema = validationSchema.value;
  const validationFields = toValue(allFields).map((field) => ({
    id: field.id,
    type: field.type,
    localized: field.localized,
    required: isFieldRequired(field),
    acceptance: isAcceptanceField(field),
  }));
  return {
    "~standard": {
      version: 1 as const,
      vendor: "dms",
      validate: (value: unknown) =>
        validateFormState(schema, value as Record<string, unknown>, {
          fields: validationFields,
          requiredMessage: processApiMessage(REQUIRED_MESSAGE),
          locale: locale.value,
          parseParams: { errorMap: issueErrorMap },
          controlErrors,
        }),
    },
  };
});

// What controls refuse of what was typed into them, by field id: a field
// error of its own, checked again as soon as it is reported or withdrawn.
const controlErrors = reactive(new Map<string, string>());
provide(FORM_CONTROL_ERRORS_KEY, {
  report(fieldId, message) {
    if (message) controlErrors.set(fieldId, processApiMessage(message));
    else controlErrors.delete(fieldId);
    void form.value?.validate({ name: fieldId, silent: true });
  },
});

/**
 * A control that tells UForm nothing (a picker, a tree, a rich-text editor)
 * still gets its error refreshed as its value changes: once a field shows an
 * error, each change re-validates it, so the message clears once fixed.
 */
const fieldValueSnapshots = new Map<string, string>();
watch(
  state,
  (current) => {
    for (const field of toValue(allFields)) {
      const snapshot = JSON.stringify(current[field.id]) ?? "";
      const previous = fieldValueSnapshots.get(field.id);
      fieldValueSnapshots.set(field.id, snapshot);
      if (previous === undefined || previous === snapshot) continue;
      if (!form.value || serverErrorValues.has(field.id)) continue;
      const pattern = fieldErrorPattern(field.id);
      if (!form.value.getErrors(pattern).length) continue;
      void form.value.validate({ name: errorNames(field), silent: true });
    }
  },
  { deep: true, immediate: true },
);

const { t, locale, locales } = useI18n();

const submitButtonLabel = computed(() =>
  props.submitLabel
    ? processI18n(props.submitLabel)
    : t("dms.button.save_changes"),
);

watch(disabledFields, (newDisabled, oldDisabled) => {
  if (!newDisabled || !form.value) return;

  for (const fieldId of newDisabled) {
    if (!oldDisabled?.has(fieldId)) {
      form.value.clear(fieldId);
    }
  }
});

watch(hiddenFields, (newHidden, oldHidden) => {
  if (!newHidden || !form.value) return;

  for (const fieldId of newHidden) {
    if (!oldHidden?.has(fieldId)) {
      form.value.clear(fieldId);
    }
  }
});

// The drawer or modal this form sits in, even when a component of the
// caller's wraps it (only the container's root gets `containerId`).
const container = inject(DMS_CONTAINER_KEY, undefined);
const containerId = props.containerId ?? container?.id;

/** The value of every field, by id: what "unsaved changes" compares. */
function fieldValues(): Record<string, unknown> {
  return Object.fromEntries(
    toValue(allFields).map((field) => [field.id, state.value[field.id]]),
  );
}

// Dirty while a field's value differs from the one the form loaded or last
// saved; putting the original value back makes it clean again.
const formDirty = useFormDirty(fieldValues);
// Until the user acts on the form, a control settling its value (a picker
// mapping what was loaded, an editor normalising its markup) sets the
// starting point instead of reading as a change.
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
  const element = form.value?.$el as HTMLElement | undefined;
  for (const type of TOUCH_EVENTS) {
    element?.addEventListener?.(type, markTouched, { capture: true });
  }
});

/** The current values become the saved ones: nothing left unsaved. */
function markFormClean(): void {
  isTouched = false;
  showsErrorSummary.value = false;
  formDirty.markClean();
}

/** Discard: every field back to the value it opened with. */
function discardChanges(): void {
  reset(form.value);
  markFormClean();
}

const changedFields = computed(() =>
  toValue(allFields).filter(
    (field) =>
      !sameFormValue(state.value[field.id], formDirty.baseline.value[field.id]),
  ),
);
// Only a form someone can save has unsaved changes to speak of.
const canSave = showActions;
const isDirty = computed(() => canSave.value && changedFields.value.length > 0);

useUnsavedChanges({ dirty: isDirty, containerId, element: form });

// A record form offers Cancel while clean when it has somewhere to go back
// to: its drawer or modal, or `backTo` on a page. An action form (send,
// invite, run) shows its buttons in its footer once a value changes: Reset
// and its own submit label.
const isActionForm = props.kind === "action";
const canCancel = inFormContainer || !!container || !!props.backTo;
const usesSaveBar = saveMode === "bar" && !inFormContainer && !isActionForm;
const hasChangeableFields = computed(() =>
  toValue(allFields).some(
    (field) => !isFieldDisabled(field) && !isFieldHidden(field),
  ),
);
const showsActionButtons = computed(() =>
  actionFormShowsButtons(isDirty.value, hasChangeableFields.value),
);

const router = useDmsRouter();
const route = useDmsRoute();
/**
 * Cancel, with nothing to save: closes the drawer or modal, or leaves a page
 * form for the page the user came from (its list, when opened from one), or
 * its `backTo` when the form was opened directly.
 */
function cancelForm(): void {
  if (container) {
    void container.close();
    return;
  }
  const navigation = (window as { navigation?: { canGoBack?: boolean } })
    .navigation;
  if (navigation?.canGoBack ?? window.history.length > 1) {
    window.history.back();
    return;
  }
  if (props.backTo) void router.push(props.backTo);
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
  if (!runValidators()) return;
  handleSubmit(event);
}

provide(FORM_VALIDATOR_KEY, registerValidator);
provide(FORM_FIELD_LOADING_KEY, setFieldLoading);
provide(FORM_CONTENT_LANGUAGE_KEY, "*");

allFields.value.forEach((field) => {
  if (field.defaultValue === undefined) return;
  state.value[field.id] = cloneFormValue(field.defaultValue);
  initialValues.value[field.id] = cloneFormValue(
    field.defaultValue,
  ) as FormFieldValue;
});

if (props.fetchUrl) {
  const formLoad = await useDmsAsyncData(
    `form-${props.componentId}-${props.pageId}`,
    async () => ({
      values: await fetchData(),
      initial: initialValues.value,
    }),
  );

  // The load is cached under this key, and outlives a drawer or modal: a
  // reopening would show the values of the previous one, stale if the row
  // changed since (here or elsewhere). Marked idle once read, every mounting
  // fetches the row again.
  onMounted(() => {
    formLoad.status.value = "idle";
  });

  const payload = formLoad.data.value;
  if (payload) {
    if (payload.values && Object.keys(payload.values).length > 0) {
      Object.assign(state.value, payload.values);
    }
    if (payload.initial && payload.initial !== initialValues.value) {
      initialValues.value = { ...initialValues.value, ...payload.initial };
    }
  }
}

// Loaded (or filled with its defaults): this is what the form starts from.
markFormClean();

// A form page about one row names it at the end of the breadcrumb. Set once
// mounted: the header renders before the page, the server-rendered one too.
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

const isHorizontal = props.fieldsOrientation !== "vertical";
const surface: FormSurface = inFormContainer
  ? "container"
  : hasSections
    ? "sections"
    : inSection
      ? "section"
      : "card";
const surfaceClasses = FORM_SURFACE_CLASSES[surface];
// Clip, not hidden: the card rounds the footer band without becoming the
// scroll container the sticky footer would stick to.
const wrapperProps =
  FormWrapper === "div" ? {} : { padded: false, class: "overflow-clip" };

/** Row classes: a section card's, or the form's own orientation's. */
function layoutClasses(inSectionCard: boolean) {
  if ((inSectionCard || inSection) && isHorizontal) {
    return SECTION_LAYOUT_CLASSES;
  }
  return FORM_LAYOUT_CLASSES[isHorizontal ? "horizontal" : "vertical"];
}

function isFieldDisabled(field: FormField): boolean {
  if (field.disabled) return true;
  return disabledFields.value?.has(field.id) ?? false;
}

function isFieldHidden(field: FormField): boolean {
  return hiddenFields.value?.has(field.id) ?? false;
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
});

const sectionsLayout = computed(() =>
  hasSections ? layoutSections(fields.value, props.sections ?? []) : undefined,
);
const sectionNav = resolveSectionNav(
  props.sectionNav,
  props.sections?.length ?? 0,
);

// The fields the form shows an error on, from UForm's own list: what the
// validation summary and the sections' counts read.
const invalidFields = computed<ReadonlySet<string>>(() => {
  const errors: ReadonlyArray<{ name?: string }> = form.value?.errors ?? [];
  return new Set(invalidFieldIds(errors, allFieldIds.value));
});
const changedFieldIds = computed(
  () => new Set(changedFields.value.map((field) => field.id)),
);
const sectionStates = computed<Record<string, FormSectionState>>(() =>
  Object.fromEntries(
    (sectionsLayout.value?.sections ?? []).map((section) => [
      section.id,
      sectionState(section, changedFieldIds.value, invalidFields.value),
    ]),
  ),
);

/** What the form names a field by: its label, or its group's. */
const fieldLabels = computed(() => {
  const labels = new Map<string, string>();
  for (const entry of fields.value) {
    const fieldsOfEntry = isFieldGroup(entry) ? entry.fields : [entry];
    for (const field of fieldsOfEntry) {
      const label = field.label || entry.label || field.id;
      labels.set(field.id, processI18n(label));
    }
  }
  return labels;
});

const sectionOfField = computed(() => {
  const owners = new Map<string, string>();
  for (const section of sectionsLayout.value?.sections ?? []) {
    for (const id of section.fieldIds) owners.set(id, section.label);
  }
  return owners;
});

watch(invalidFields, (invalid) => {
  if (invalid.size === 0) showsErrorSummary.value = false;
});

// One entry per row to fix: the unlabelled fields of a group share its
// label, and its first invalid field stands for them.
const errorSummaryItems = computed(() => {
  if (!showsErrorSummary.value) return [];
  const items = [...invalidFields.value].map((id) => {
    const section = sectionOfField.value.get(id);
    return {
      id,
      label: fieldLabels.value.get(id) ?? id,
      section: section ? processI18n(section) : undefined,
    };
  });
  return items.filter(
    (item, index) =>
      items.findIndex(
        (other) => other.label === item.label && other.section === item.section,
      ) === index,
  );
});

// The save bar names what changed: the sections holding a change, or the
// fields whose value moved off the one the form loaded (or last saved — a
// successful submit snapshots it).
const formElementId = `dms-form-${props.componentId}`;
const changedFieldLabels = computed<string[]>(() => {
  if (!usesSaveBar) return [];
  const layout = sectionsLayout.value;
  if (!layout)
    return changedFields.value.map((field) => field.label || field.id);
  const leadIds = new Set(layout.lead.flatMap(entryFieldIds));
  return [
    ...changedFields.value
      .filter((field) => leadIds.has(field.id))
      .map((field) => field.label || field.id),
    ...layout.sections
      .filter((section) => sectionStates.value[section.id]?.dirty)
      .map((section) => section.label),
  ];
});

interface RealtimeFormContext {
  location: string;
  rowId: string;
  presenceTopic: string;
  rowTopic: string;
}

const parseRealtimeContext = (
  fetchUrl: string | undefined,
): RealtimeFormContext | null => {
  if (!fetchUrl || !fetchUrl.includes(REALTIME_PRESENCE_FLAG)) return null;
  const url = new URL(fetchUrl, "http://placeholder");
  const idx = url.pathname.lastIndexOf(REALTIME_GET_SEGMENT);
  if (idx === -1) return null;
  const location = url.pathname.slice(0, idx);
  const rowId = url.searchParams.get("id");
  if (!location || !rowId) return null;
  return {
    location,
    rowId,
    presenceTopic: `${REALTIME_PRESENCE_TOPIC_PREFIX}${location}`,
    rowTopic: `${REALTIME_ROW_TOPIC_PREFIX}${location}`,
  };
};

const realtimeContext = computed(() =>
  parseRealtimeContext(resolvedFetchUrl.value),
);
const showConcurrentEditBanner = ref(false);
const { user: realtimeUser } = useUserSession();
const { $authFetch } = useAuthFetch();
const pageRealtime = useUserRealtime();
const acquired = ref<{
  sessionId: string;
  pageId: string;
  topic: string;
  key: string;
} | null>(null);

watch(
  () =>
    [
      pageRealtime.sessionId.value,
      pageRealtime.pageId.value,
      realtimeContext.value,
    ] as const,
  async ([sessionId, pageId, ctx]) => {
    if (!sessionId || !pageId || !ctx) return;
    if (
      acquired.value &&
      acquired.value.sessionId === sessionId &&
      acquired.value.topic === ctx.presenceTopic &&
      acquired.value.key === ctx.rowId
    ) {
      return;
    }
    try {
      await $authFetch(REALTIME_ACQUIRE_PATH, {
        method: "POST",
        body: { pageId, topic: ctx.presenceTopic, key: ctx.rowId },
      });
      acquired.value = {
        sessionId,
        pageId,
        topic: ctx.presenceTopic,
        key: ctx.rowId,
      };
    } catch (error) {
      console.warn("[Form] acquire failed", error);
    }
  },
  { immediate: true },
);

useRealtimeTopic(
  () => realtimeContext.value?.rowTopic,
  (event) => {
    const ctx = realtimeContext.value;
    if (!ctx) return;
    const eventTyped = event as {
      type: string;
      payload?: { ids?: string[] };
      actorId?: string;
    };
    if (eventTyped.type !== REALTIME_EVENT_UPDATED) return;
    if (!eventTyped.payload?.ids?.includes(ctx.rowId)) return;
    if (eventTyped.actorId === realtimeUser.value?._id) return;
    showConcurrentEditBanner.value = true;
  },
);

const handleDiscardAndRefresh = async () => {
  const fresh = await fetchData();
  if (fresh && Object.keys(fresh).length > 0) {
    Object.assign(state.value, fresh);
  }
  // The refreshed row is the new starting point: nothing unsaved.
  markFormClean();
  showConcurrentEditBanner.value = false;
};

const handleKeepEditing = () => {
  showConcurrentEditBanner.value = false;
};

onUnmounted(async () => {
  const captured = acquired.value;
  if (!captured || submitSucceeded.value) return;
  try {
    await $authFetch(REALTIME_RELEASE_PATH, {
      method: "POST",
      body: {
        pageId: captured.pageId,
        topic: captured.topic,
        key: captured.key,
      },
    });
  } catch (error) {
    console.warn("[Form] release on close failed", error);
  }
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

      <div :class="surfaceClasses.body">
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
          v-if="errorSummaryItems.length"
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
        />
        <DmsFormEntries v-else :entries="fields" />

        <p
          v-if="hasRequiredFields"
          class="text-dimmed text-xs"
          :class="surfaceClasses.legend"
        >
          <span class="text-error" aria-hidden="true">*</span>
          {{ $t("dms.form.required_legend") }}
        </p>
      </div>

      <!-- A page form's bar (v2 save bar, or the footer band) holds its place
        while hidden, so its showing up never moves anything. -->
      <!-- A table view's form always shows its footer: Cancel while there
        is nothing to save (closing the drawer or modal, or back to the
        previous page), "Unsaved changes" with Discard and Save once there is.
        Same height in both states: only the content changes. -->
      <DmsSaveBar
        v-if="canSave && usesSaveBar"
        :dirty="isDirty"
        :saving="loading || isAnyFieldLoading"
        :changes="changedFieldLabels"
        :form="formElementId"
        :save-label="props.submitLabel"
        :cancellable="canCancel"
        class="mx-3 mb-3"
        @discard="discardChanges"
        @cancel="cancelForm"
      />
      <!-- An action form (send, invite, run) has nothing to cancel: its
        buttons show once a value changes, Reset and its own submit label,
        and keep their place while hidden. -->
      <footer
        v-else-if="canSave && isActionForm"
        class="flex items-center justify-end gap-2 transition-[opacity,translate,visibility] duration-200 ease-out"
        :class="[
          surfaceClasses.foot,
          !showsActionButtons && 'invisible translate-y-1 opacity-0',
        ]"
        :inert="!showsActionButtons || undefined"
        :aria-hidden="!showsActionButtons || undefined"
      >
        <UButton
          v-if="hasChangeableFields"
          :label="$t('dms.button.reset')"
          :disabled="loading || isAnyFieldLoading"
          variant="outline"
          color="neutral"
          size="lg"
          @click="discardChanges"
        />
        <UButton
          :label="submitButtonLabel"
          :loading="loading || isAnyFieldLoading"
          type="submit"
          size="lg"
        />
      </footer>
      <footer
        v-else-if="canSave"
        class="flex items-center gap-2"
        :class="[surfaceClasses.foot, !isDirty && !canCancel && 'invisible']"
        :inert="(!isDirty && !canCancel) || undefined"
      >
        <template v-if="isDirty">
          <span
            class="text-muted inline-flex min-w-0 items-center gap-2 text-[12.5px]"
            role="status"
          >
            <span
              class="bg-warning ring-warning/15 size-[7px] shrink-0 rounded-full ring-3"
              aria-hidden="true"
            />
            <span class="truncate">{{ $t("dms.save_bar.unsaved") }}</span>
          </span>
          <div class="ms-auto flex shrink-0 gap-2">
            <UButton
              :label="$t('dms.save_bar.discard')"
              :disabled="loading || isAnyFieldLoading"
              variant="outline"
              color="neutral"
              size="lg"
              @click="discardChanges"
            />
            <UButton
              :label="submitButtonLabel"
              :loading="loading || isAnyFieldLoading"
              type="submit"
              size="lg"
            />
          </div>
        </template>
        <UButton
          v-else-if="canCancel"
          :label="$t('dms.button.cancel')"
          variant="outline"
          color="neutral"
          size="lg"
          class="ms-auto"
          @click="cancelForm"
        />
      </footer>
    </UForm>
  </component>
</template>
