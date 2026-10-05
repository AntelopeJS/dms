<script setup lang="ts">
import type { FormProps } from "../../composables/form/types/props";
import type { FormFieldValue } from "../../composables/form/types/value";
import type { FieldGroup } from "../../composables/form/types/field";
import {
  cloneFormValue,
  type FormServerFieldError,
  formShowsActions,
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
  formFooterKind,
} from "../../composables/form/formFooter";
import { usePageRecordLabel } from "#dms-core/app/composables/page/usePageRecordLabel";
import { formatRecordLabel } from "../../build/composables/table-view/utils/formTexts";

const REALTIME_PRESENCE_FLAG = "_presence=1";
const REALTIME_ACQUIRE_PATH = "/api/realtime/acquire";
const REALTIME_RELEASE_PATH = "/api/realtime/release";
const REALTIME_PRESENCE_TOPIC_PREFIX = "tableview:presence:";
const REALTIME_ROW_TOPIC_PREFIX = "tableview:row:";
const REALTIME_GET_SEGMENT = "/get";
const REALTIME_EVENT_UPDATED = "updated";

// `showActions` left out has to read as left out: Vue casts an absent boolean
// prop to `false`, which would hide the buttons of every form not asking for
// them.
const props = withDefaults(defineProps<FormProps>(), {
  showActions: undefined,
  resetOnSuccess: false,
});
const form = useTemplateRef("form");

// Inside a DynamicModal/DynamicDrawer the container already provides the
// surface, so skip the DmsCard wrapper to avoid a nested, detached card.
const inFormContainer = inject("dmsFormContainer", false);
// Inside a framed DmsSection the section card is the surface: the fields
// become its rows (v2 .st-row) instead of a card nested in a card.
const inSection = !inFormContainer && inject(DMS_SECTION_SURFACE_KEY, false);
const FormWrapper =
  inFormContainer || inSection ? "div" : resolveComponent("DmsCard");

const { processI18n, processApiMessage } = useTranslation();

// Server errors stay on their field until its value changes (UForm only
// re-validates a field once it was left, and its schema knows nothing of
// them): the value each one was raised against.
const serverErrorValues = new Map<string, string>();

/** The control of a field, by its id, inside this form only. */
function fieldControl(name: string | undefined): HTMLElement | null {
  const element = form.value?.$el as HTMLElement | undefined;
  if (!name || !element?.querySelector) return null;
  return element.querySelector<HTMLElement>(`[id="${CSS.escape(name)}"]`);
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * The errors of a field: its own and those of its parts (an address's
 * street, a gallery's image), which zod names `<id>.<part>`.
 */
function fieldErrorPattern(id: string): RegExp {
  return new RegExp(`^${id.replace(REGEXP_SPECIALS, "\\$&")}(\\.|$)`);
}

/** The names a field's errors go under: one per language when localized. */
function errorNames(field: FormField): string[] {
  if (!field.localized) return [field.id];
  return locales.value.map((lang) => `${field.id}.${lang.code}`);
}

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
 * Focuses a field's control, or its first focusable part (a pill group, a
 * picker trigger); a field with nothing to focus is scrolled into view.
 */
async function focusField(name: string | undefined): Promise<void> {
  await formSettled();
  const control = fieldControl(name);
  const row = fieldRow(name);
  const target = control?.matches(FOCUSABLE)
    ? control
    : (control?.querySelector<HTMLElement>(FOCUSABLE) ??
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
  if (!form.value) return false;
  form.value.setErrors(errors);
  const shown = errors.filter(
    (error) => form.value?.getErrors(error.name).length,
  );
  serverErrorValues.clear();
  for (const error of shown) {
    serverErrorValues.set(error.name, JSON.stringify(state.value[error.name]));
  }
  void focusField(shown[0]?.name);
  return shown.length > 0;
}

/** A submit the client-side validation stopped: focus the first bad field. */
function onValidationError(event: { errors: Array<{ name?: string }> }): void {
  void focusField(event.errors[0]?.name);
}

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
      form.value?.clear(name);
    }
  },
  { deep: true },
);

const showActions = computed(() => formShowsActions(props, toValue(allFields)));

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
        }),
    },
  };
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
const canSave = computed(() => showActions.value || !!props.saveBar);
const isDirty = computed(() => canSave.value && changedFields.value.length > 0);

useUnsavedChanges({ dirty: isDirty, containerId, element: form });

// A table view's form (drawer, modal, form page) offers Cancel while clean;
// a form placed on a page to do something shows no buttons until a value
// changes, then Reset and its own submit label.
const isActionForm =
  formFooterKind({
    inContainer: inFormContainer || !!container,
    cancellable: props.cancellable,
  }) === "action";
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
const findPage = inFormContainer
  ? undefined
  : useSiteLayout().findMatchingRoute;

/** The closest page above the current one (a form page's list). */
function parentPagePath(): string {
  const segments = route.path.split("/").filter(Boolean);
  while (segments.length > 1) {
    segments.pop();
    const path = `/${segments.join("/")}`;
    if (findPage?.(path)) return path;
  }
  return "/";
}

/**
 * Cancel, with nothing to save: closes the drawer or modal, or leaves a page
 * form for the page the user came from (its list, when opened from one), or
 * the page above it when the form was opened directly.
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
  void router.push(parentPagePath());
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
if (props.recordLabelKey && !inFormContainer) {
  const { setLabel } = usePageRecordLabel();
  const recordLabelKey = props.recordLabelKey;
  onMounted(() => {
    setLabel(
      route.path,
      formatRecordLabel(initialValues.value[recordLabelKey], locale.value),
    );
  });
}

type FormOrientation = "horizontal" | "vertical";
type FormSurface = "card" | "container" | "section";

interface FormLayoutClasses {
  rows: string;
  row: string;
  meta: string;
  description: string;
}

interface FormSurfaceClasses {
  head: string;
  body: string;
  legend: string;
  foot: string;
}

// v2 record form (mockup form.html): horizontal rows put the label column
// (minmax(180px, 38%)) beside the control, split by hairlines, and collapse
// to one column under 560px of form width; vertical rows stack them.
const FORM_LAYOUT_CLASSES: Record<FormOrientation, FormLayoutClasses> = {
  horizontal: {
    rows: "@container flex flex-col divide-y divide-muted py-1",
    row: "grid gap-2 py-4 @min-[560px]:grid-cols-[minmax(180px,38%)_minmax(0,1fr)] @min-[560px]:gap-6",
    meta: "grid content-start gap-px @min-[560px]:pt-1.5",
    description: "text-muted max-w-[34ch] text-[12.5px]",
  },
  vertical: {
    rows: "flex flex-col gap-4 py-5",
    row: "grid gap-1.5",
    meta: "grid gap-px",
    description: "text-dimmed text-xs",
  },
};

// A card form draws its own head band and sticky footer band; inside a
// modal or drawer the container is the surface and already pads the body.
// The footer sticks to the bottom of the scroll area while the form runs
// past it, and sits under the fields when it fits. In a container it
// reaches over the scroll area's padding (`--dms-form-foot-*`, set by the
// drawer and the modal) to sit flush with its edges.
const FORM_SURFACE_CLASSES: Record<FormSurface, FormSurfaceClasses> = {
  card: {
    head: "border-default border-b px-5 py-4.5",
    body: "px-5",
    legend: "pb-4",
    foot: "border-default sticky bottom-0 z-10 border-t bg-(--dms-bg-muted)/90 px-5 py-3 backdrop-blur-sm",
  },
  container: {
    head: "border-default border-b pb-4",
    body: "",
    legend: "pb-2",
    foot: "border-default bg-default sticky bottom-[calc(var(--dms-form-foot-pb,0px)*-1)] z-10 mt-2 -mx-[var(--dms-form-foot-px,0px)] -mb-[var(--dms-form-foot-pb,0px)] border-t px-[var(--dms-form-foot-px,0px)] pt-3 pb-[var(--dms-form-foot-pb,12px)]",
  },
  // The rows carry the 18px inset so their hairlines run edge to edge.
  section: {
    head: "border-default border-b px-[18px] py-4",
    body: "",
    legend: "px-[18px] pb-4",
    foot: "border-default sticky bottom-0 z-10 border-t bg-(--dms-bg-muted)/90 px-[18px] py-3 backdrop-blur-sm",
  },
};

// v2 .st-row.is-form: a 240px label column, 18px row inset.
const SECTION_LAYOUT_CLASSES: FormLayoutClasses = {
  rows: "@container flex flex-col divide-y divide-muted",
  row: "grid gap-2 px-[18px] py-4 @min-[560px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)] @min-[560px]:gap-6",
  meta: "grid content-start gap-px @min-[560px]:pt-1.5",
  description: "text-muted text-[12.5px] leading-normal",
};

// Grouped controls sit side by side once the form is wide enough for its
// label column (the same 560px container step), whatever the viewport: a
// narrow modal or drawer form stacks them.
const GROUP_FIELDS_CLASSES: Record<FormOrientation, string> = {
  horizontal: "flex flex-col gap-2.5 @min-[560px]:flex-row",
  vertical: "flex flex-col gap-2.5",
};

const layoutClasses = computed(() => {
  const orientation =
    props.fieldsOrientation === "vertical" ? "vertical" : "horizontal";
  return inSection && orientation === "horizontal"
    ? SECTION_LAYOUT_CLASSES
    : FORM_LAYOUT_CLASSES[orientation];
});
const surface: FormSurface = inFormContainer
  ? "container"
  : inSection
    ? "section"
    : "card";
const surfaceClasses = FORM_SURFACE_CLASSES[surface];
// Clip, not hidden: the card rounds the footer band without becoming the
// scroll container the sticky footer would stick to.
const wrapperProps =
  inFormContainer || inSection ? {} : { padded: false, class: "overflow-clip" };

// The save bar names what changed: the fields whose value moved off the one the
// form loaded (or last saved — a successful submit snapshots it).
const formElementId = `dms-form-${props.componentId}`;
const changedFieldLabels = computed<string[]>(() =>
  props.saveBar
    ? changedFields.value.map((field) => field.label || field.id)
    : [],
);

function groupFieldsClass(group: FieldGroup): string {
  return GROUP_FIELDS_CLASSES[
    group.orientation === "vertical" ? "vertical" : "horizontal"
  ];
}

function resolveFieldComponent(field: FormField) {
  if (!field.component.componentName) {
    return null;
  }

  return (
    resolveDmsComponent(field.component.componentName) ||
    field.component.componentName
  );
}

function isFieldDisabled(field: FormField): boolean {
  if (field.disabled) return true;
  return disabledFields.value?.has(field.id) ?? false;
}

function isFieldHidden(field: FormField): boolean {
  return hiddenFields.value?.has(field.id) ?? false;
}

function isGroupVisible(group: { fields: FormField[] }): boolean {
  return group.fields.some((field) => !isFieldHidden(field));
}

function isFieldRequired(field: FormField): boolean {
  return isFieldMarkedRequired(
    field,
    disabledFields.value,
    hiddenFields.value,
    requiredFields.value,
  );
}

function isGroupRequired(group: { fields: FormField[] }): boolean {
  return group.fields.some(isFieldRequired);
}

const hasRequiredFields = computed(() =>
  toValue(allFields).some(isFieldRequired),
);

function shouldShowDisplay(field: FormField): boolean {
  return isFieldDisabled(field) && !!field.type;
}

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

        <div :class="layoutClasses.rows">
          <template v-for="(item, index) in fields" :key="`field-${index}`">
            <template v-if="isFieldGroup(item)">
              <section v-if="isGroupVisible(item)" :class="layoutClasses.row">
                <div :class="layoutClasses.meta">
                  <span class="text-highlighted text-[13px] font-[550]">
                    {{ processI18n(item.label || "") }}
                    <span
                      v-if="isGroupRequired(item)"
                      class="text-error ms-0.5"
                      aria-hidden="true"
                    >
                      *
                    </span>
                  </span>
                  <p v-if="item.description" :class="layoutClasses.description">
                    {{ processI18n(item.description || "") }}
                  </p>
                </div>

                <div :class="groupFieldsClass(item)">
                  <template v-for="field in item.fields" :key="field.id">
                    <template v-if="!isFieldHidden(field)">
                      <DmsLocalizedField
                        v-if="field.component.componentName && field.localized"
                        v-model="
                          state[field.id] as Record<string, string> | undefined
                        "
                        :field
                        :initial-values="initialValues"
                        :loading
                        :component-id="props.componentId"
                        :page-id="props.pageId"
                        class="min-w-0 flex-1"
                      />

                      <UFormField
                        v-else-if="
                          field.component.componentName && !field.localized
                        "
                        :name="field.id"
                        :error-pattern="fieldErrorPattern(field.id)"
                        :data-field="field.id"
                        class="min-w-0 flex-1"
                      >
                        <DmsDisplay
                          v-if="shouldShowDisplay(field)"
                          :model-value="state[field.id]"
                          :type="field.type"
                          :loading
                          class="w-full"
                          v-bind="field.component.options || {}"
                        />
                        <Component
                          :is="resolveFieldComponent(field)"
                          v-else
                          :id="field.id"
                          v-model="state[field.id]"
                          :initial-value="initialValues?.[field.id]"
                          :loading
                          :disabled="isFieldDisabled(field)"
                          :component-id="props.componentId"
                          :page-id="props.pageId"
                          :route-params="props.routeParams"
                          class="w-full"
                          v-bind="field.component.options || {}"
                        />
                        <template #error="{ error }">
                          <template v-if="error">
                            <UIcon
                              name="i-ph-warning-circle"
                              class="size-3.5 shrink-0"
                            />
                            {{ error }}
                          </template>
                        </template>
                      </UFormField>
                    </template>
                  </template>
                </div>
              </section>
            </template>

            <section
              v-else-if="!isFieldHidden(item)"
              :class="layoutClasses.row"
            >
              <div :class="layoutClasses.meta">
                <label
                  :for="item.id"
                  class="text-highlighted text-[13px] font-[550]"
                >
                  {{ processI18n(item.label || "") }}
                  <span
                    v-if="isFieldRequired(item)"
                    class="text-error ms-0.5"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>
                <p v-if="item.description" :class="layoutClasses.description">
                  {{ processI18n(item.description || "") }}
                </p>
              </div>

              <DmsLocalizedField
                v-if="item.component.componentName && item.localized"
                v-model="state[item.id] as Record<string, string> | undefined"
                :field="item"
                :initial-values="initialValues"
                :loading
                :component-id="props.componentId"
                :page-id="props.pageId"
                class="min-w-0"
              />

              <UFormField
                v-else-if="item.component.componentName && !item.localized"
                :name="item.id"
                :error-pattern="fieldErrorPattern(item.id)"
                :data-field="item.id"
                class="min-w-0"
              >
                <DmsDisplay
                  v-if="shouldShowDisplay(item)"
                  :model-value="state[item.id]"
                  :type="item.type"
                  :loading
                  class="w-full"
                  v-bind="item.component.options || {}"
                />
                <Component
                  :is="resolveFieldComponent(item)"
                  v-else
                  :id="item.id"
                  v-model="state[item.id]"
                  :initial-value="initialValues?.[item.id]"
                  :loading
                  :disabled="isFieldDisabled(item)"
                  :component-id="props.componentId"
                  :page-id="props.pageId"
                  :route-params="props.routeParams"
                  class="w-full"
                  v-bind="item.component.options || {}"
                />
                <template #error="{ error }">
                  <template v-if="error">
                    <UIcon
                      name="i-ph-warning-circle"
                      class="size-3.5 shrink-0"
                    />
                    {{ error }}
                  </template>
                </template>
              </UFormField>
            </section>
          </template>
        </div>

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
        v-if="props.saveBar && !inFormContainer"
        :dirty="isDirty"
        :saving="loading || isAnyFieldLoading"
        :changes="changedFieldLabels"
        :form="formElementId"
        :save-label="props.submitLabel"
        :cancellable="!isActionForm"
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
        :class="surfaceClasses.foot"
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
          v-else
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
