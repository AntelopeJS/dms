<script setup lang="ts">
import type { FormProps } from "../../composables/form/types";
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
import { validationIssueMessage } from "#dms-core/app/composables/useFieldErrors";

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

const FOCUSABLE =
  "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Focuses a field's control, or its first focusable part (a pill group). */
async function focusField(name: string | undefined): Promise<void> {
  await nextTick();
  const control = fieldControl(name);
  const target = control?.matches(FOCUSABLE)
    ? control
    : control?.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus();
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
} = useForm(props, { showFieldErrors });

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
const issueErrorMap: ZodErrorMap = (issue) => ({
  message: processApiMessage(validationIssueMessage(issue)),
});

/** The validation schema, as a Standard Schema validating with that map. */
const localizedSchema = computed(() => {
  const schema = validationSchema.value;
  return {
    "~standard": {
      version: 1 as const,
      vendor: "dms",
      validate: async (value: unknown) => {
        const result = await schema.safeParseAsync(value, {
          errorMap: issueErrorMap,
        });
        return result.success
          ? { value: result.data }
          : {
              issues: result.error.issues.map(({ message, path }) => ({
                message,
                path,
              })),
            };
      },
    },
  };
});

const { addGuard } = useLeaveGuard();
const { confirm } = useConfirm();
const { t } = useI18n();

const submitButtonLabel = computed(() =>
  props.submitLabel
    ? processI18n(props.submitLabel)
    : t("dms.button.save_changes"),
);

const isDirty = ref(false);
watch(
  () => form.value?.dirty,
  (dirty) => {
    if (dirty !== undefined) isDirty.value = dirty;
  },
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

async function unsavedChangesGuard() {
  if (submitSucceeded.value || !isDirty.value) {
    return true;
  }

  return await confirm({
    title: t("dms.confirm.unsaved_changes_title"),
    description: t("dms.confirm.unsaved_changes_description"),
    confirmLabel: t("dms.confirm.discard"),
    cancelLabel: t("dms.confirm.stay"),
    confirmColor: "error",
  });
}

if (props.containerId) {
  addGuard(props.containerId, unsavedChangesGuard);
} else {
  const { registerGuard } = usePageLeaveGuard();
  registerGuard(unsavedChangesGuard);
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
  const { data: fetchedFormData } = await useDmsAsyncData(
    `form-${props.componentId}-${props.pageId}`,
    async () => ({
      values: await fetchData(),
      initial: initialValues.value,
    }),
  );

  const payload = fetchedFormData.value;
  if (payload) {
    if (payload.values && Object.keys(payload.values).length > 0) {
      Object.assign(state.value, payload.values);
    }
    if (payload.initial && payload.initial !== initialValues.value) {
      initialValues.value = { ...initialValues.value, ...payload.initial };
    }
  }
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
    foot: "border-default mt-2 border-t pt-4",
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
const isBlankValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);
const changedFieldLabels = computed<string[]>(() => {
  if (!props.saveBar) return [];
  return toValue(allFields)
    .filter((field) => {
      const current = state.value[field.id];
      const initial = initialValues.value?.[field.id];
      if (isBlankValue(current) && isBlankValue(initial)) return false;
      return JSON.stringify(current) !== JSON.stringify(initial);
    })
    .map((field) => field.label || field.id);
});

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
    <UForm
      :id="formElementId"
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

      <DmsSaveBar
        v-if="props.saveBar"
        :dirty="changedFieldLabels.length > 0"
        :saving="loading || isAnyFieldLoading"
        :changes="changedFieldLabels"
        :form="formElementId"
        :save-label="props.submitLabel"
        :class="inFormContainer ? 'mb-0' : 'mx-3 mb-3'"
        @discard="reset(form)"
      />
      <footer
        v-else-if="showActions"
        class="flex items-center gap-2"
        :class="surfaceClasses.foot"
      >
        <span
          v-if="isDirty"
          class="text-muted inline-flex items-center gap-2 text-[12.5px]"
        >
          <span
            class="bg-warning ring-warning/15 size-[7px] rounded-full ring-3"
            aria-hidden="true"
          />
          {{ $t("dms.form.unsaved_changes") }}
        </span>
        <div class="ms-auto flex gap-2">
          <UButton
            :label="$t('dms.button.reset')"
            :loading="loading || isAnyFieldLoading"
            variant="outline"
            color="neutral"
            type="reset"
            size="lg"
            @click="reset(form)"
          />
          <UButton
            :label="submitButtonLabel"
            :loading="loading || isAnyFieldLoading"
            type="submit"
            size="lg"
          />
        </div>
      </footer>
    </UForm>
  </component>
</template>
