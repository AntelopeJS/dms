<script setup lang="ts">
import type { FormProps } from "../../composables/form/types";
import type { FormFieldValue } from "../../composables/form/types/value";
import {
  cloneFormValue,
  formShowsActions,
  isFieldMarkedRequired,
} from "../../composables/form/useForm";
import {
  FORM_VALIDATOR_KEY,
  type FormValidator,
} from "../../composables/form/types/validation";
import { FORM_FIELD_LOADING_KEY } from "../../composables/form/types/field-loading";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../composables/form/types/content-language";

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
const FormWrapper = inFormContainer ? "div" : resolveComponent("DmsCard");

const { processI18n } = useTranslation();
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
} = useForm(props);

const showActions = computed(() => formShowsActions(props, toValue(allFields)));

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

const sectionClass = computed(() =>
  props.fieldsOrientation === "vertical"
    ? "flex flex-col gap-2"
    : "grid grid-cols-1 gap-2 sm:grid-cols-[min(50%,--spacing(80))_auto]",
);

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
  <component :is="FormWrapper">
    <UForm
      ref="form"
      :state
      :schema="validationSchema"
      :disabled="allFields.every((field) => field.disabled)"
      @submit="onSubmit"
    >
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
        class="mb-4"
      />

      <template v-if="props.title">
        <section class="space-y-1">
          <h2 class="text-highlighted text-2xl font-semibold sm:text-xl">
            {{ processI18n(props.title) }}
          </h2>

          <p v-if="props.description" class="text-dimmed text-base sm:text-sm">
            {{ processI18n(props.description) }}
          </p>
        </section>

        <USeparator class="my-6" />
      </template>

      <div class="space-y-6">
        <template v-for="(item, index) in fields" :key="`field-${index}`">
          <template v-if="isFieldGroup(item)">
            <section v-if="isGroupVisible(item)" :class="sectionClass">
              <div>
                <label
                  class="text-default block text-base font-semibold sm:text-sm"
                >
                  {{ processI18n(item.label || "") }}
                  <span
                    v-if="isGroupRequired(item)"
                    class="text-error ms-0.5"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>
                <p v-if="item.description" class="text-dimmed text-xs">
                  {{ processI18n(item.description || "") }}
                </p>
              </div>

              <div
                :class="[
                  'flex gap-2',
                  item.orientation === 'vertical'
                    ? 'flex-col'
                    : 'flex-col sm:flex-row',
                ]"
              >
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
                      class="flex-1"
                    />

                    <UFormField
                      v-else-if="
                        field.component.componentName && !field.localized
                      "
                      :name="field.id"
                      class="flex-1"
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
                        :class="{ 'opacity-75': isFieldDisabled(field) }"
                        v-bind="field.component.options || {}"
                      />
                    </UFormField>
                  </template>
                </template>
              </div>
            </section>
          </template>

          <template v-else-if="!isFieldHidden(item)">
            <section :class="sectionClass">
              <div>
                <label
                  :for="item.id"
                  class="text-default block text-base font-semibold sm:text-sm"
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
                <p v-if="item.description" class="text-dimmed text-xs">
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
              />

              <UFormField
                v-else-if="item.component.componentName && !item.localized"
                :name="item.id"
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
                  :class="{ 'opacity-75': isFieldDisabled(item) }"
                  v-bind="item.component.options || {}"
                />
              </UFormField>
            </section>
          </template>

          <USeparator
            v-if="
              props.fieldsOrientation !== 'horizontal' &&
              (isFieldGroup(item) ? isGroupVisible(item) : !isFieldHidden(item))
            "
          />
        </template>
      </div>

      <p v-if="hasRequiredFields" class="text-dimmed mt-6 text-xs">
        <span class="text-error" aria-hidden="true">*</span>
        {{ $t("dms.form.required_legend") }}
      </p>

      <template v-if="showActions">
        <section class="mt-6 flex justify-end gap-2">
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
        </section>
      </template>
    </UForm>
  </component>
</template>
