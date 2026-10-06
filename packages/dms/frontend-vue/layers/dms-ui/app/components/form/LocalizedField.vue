<script setup lang="ts">
import { formErrorsInjectionKey } from "@nuxt/ui/composables/useFormField";
import type { FormField } from "../../composables/form/types";
import { resolveDmsComponent } from "../../composables/resolveDmsComponent";
import { escapeRegExp } from "../../build/composables/form/formEntryContext";

interface LocalizedFieldProps {
  field: FormField;
  initialValues?: Record<string, unknown>;
  loading: boolean;
  componentId: string;
  pageId: string;
}

const props = defineProps<LocalizedFieldProps>();

const fieldValue = defineModel<Record<string, string> | undefined>();

const { locale, locales } = useI18n();

const isExpanded = ref(false);

function withAllLocales(
  current: Record<string, string>,
): Record<string, string> {
  const updated = { ...current };
  locales.value.forEach((lang) => {
    if (!(lang.code in updated)) {
      updated[lang.code] = "";
    }
  });
  return updated;
}

watch(
  fieldValue,
  (value) => {
    if (!value || typeof value !== "object") {
      fieldValue.value = withAllLocales({});
      return;
    }
    if (locales.value.some((lang) => !(lang.code in value))) {
      fieldValue.value = withAllLocales(value);
    }
  },
  { immediate: true },
);

// The values the inputs show. Until the form hands a per-locale object back
// (the watcher above fills it in, but the server render and the hydration
// pass run before that answer), every locale reads empty, so the inputs are
// in the markup from the first paint instead of popping in at hydration.
const EMPTY_TEXT = "";
const localeValues = computed<Record<string, string>>(() =>
  fieldValue.value && typeof fieldValue.value === "object"
    ? fieldValue.value
    : {},
);

function setLocaleValue(code: string, value: string): void {
  const current = fieldValue.value;
  if (current && typeof current === "object") {
    current[code] = value;
    return;
  }
  fieldValue.value = { ...withAllLocales({}), [code]: value };
}

const toggleTranslations = () => {
  isExpanded.value = !isExpanded.value;
};

const showDisplay = computed(
  () => !!props.field.disabled && !!props.field.type,
);

// The control shown in the reader's language is the field: its errors (and
// those of the field as a whole, a server's) show under it. The panel lists
// the other languages, each with its own.
const otherLocales = computed(() =>
  locales.value.filter((lang) => lang.code !== locale.value),
);
const mainErrorPattern = computed(
  () =>
    new RegExp(
      `^${escapeRegExp(props.field.id)}(\\.${escapeRegExp(locale.value)})?$`,
    ),
);

// A translation refused while the panel is closed opens it: its error shows
// on its own line.
const formErrors = inject(formErrorsInjectionKey, null);
watch(
  () => formErrors?.value ?? [],
  (errors) => {
    const isTranslationInvalid = otherLocales.value.some((lang) =>
      errors.some((error) => error.name === `${props.field.id}.${lang.code}`),
    );
    if (isTranslationInvalid) isExpanded.value = true;
  },
);
</script>

<template>
  <div class="w-full space-y-2">
    <!-- The error sits right under the control, above the toggle. -->
    <div class="relative">
      <UFormField
        :name="field.id"
        :error-pattern="mainErrorPattern"
        :data-field="field.id"
      >
        <DmsDisplay
          v-if="showDisplay"
          :model-value="localeValues[locale]"
          :type="field.type"
          :loading
          class="w-full"
          v-bind="field.component.options || {}"
        />
        <Component
          :is="
            resolveDmsComponent(field.component.componentName) ||
            field.component.componentName
          "
          v-else-if="field.component.componentName"
          :id="field.id"
          :model-value="localeValues[locale] ?? EMPTY_TEXT"
          :initial-value="
            (
              initialValues?.[field.id] as Record<string, unknown> | undefined
            )?.[locale]
          "
          :loading
          :disabled="field.disabled"
          :component-id="props.componentId"
          :page-id="props.pageId"
          class="w-full"
          :class="{ 'opacity-75': field.disabled }"
          v-bind="field.component.options || {}"
          @update:model-value="setLocaleValue(locale, $event)"
        />
        <template #error="{ error }">
          <template v-if="error">
            <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
            {{ error }}
          </template>
        </template>
      </UFormField>
      <div class="mt-1 flex justify-end">
        <UButton
          :label="$t('dms.form.localized.toggle_translations')"
          :trailing-icon="
            isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
          "
          size="xs"
          color="neutral"
          variant="ghost"
          @click="toggleTranslations"
        />
      </div>
    </div>

    <UCollapsible v-model:open="isExpanded" :ui="{ content: 'p-0.5' }">
      <template #content>
        <UCard :ui="{ body: 'sm:p-4' }">
          <div class="space-y-4">
            <div
              v-for="lang in otherLocales"
              :key="lang.code"
              class="flex items-start gap-3"
            >
              <div class="flex min-w-[140px] items-center gap-2 pt-2">
                <span class="text-default text-sm font-medium">
                  {{ lang.name }}
                </span>
              </div>

              <div class="flex-1">
                <UFormField
                  :name="`${field.id}.${lang.code}`"
                  :data-field="`${field.id}.${lang.code}`"
                >
                  <DmsDisplay
                    v-if="showDisplay"
                    :model-value="localeValues[lang.code]"
                    :type="field.type"
                    :loading
                    class="w-full"
                    v-bind="field.component.options || {}"
                  />
                  <Component
                    :is="
                      resolveDmsComponent(field.component.componentName) ||
                      field.component.componentName
                    "
                    v-else-if="field.component.componentName"
                    :id="`${field.id}_${lang.code}`"
                    :model-value="localeValues[lang.code] ?? EMPTY_TEXT"
                    :loading
                    :disabled="field.disabled"
                    :component-id="props.componentId"
                    :page-id="props.pageId"
                    class="w-full"
                    :class="{ 'opacity-75': field.disabled }"
                    v-bind="field.component.options || {}"
                    @update:model-value="setLocaleValue(lang.code, $event)"
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
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UCollapsible>
  </div>
</template>
