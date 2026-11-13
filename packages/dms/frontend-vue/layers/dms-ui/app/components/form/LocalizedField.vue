<script setup lang="ts">
import { formErrorsInjectionKey } from "@nuxt/ui/composables/useFormField";
import { isObject } from "#dms-core/app/utils/type-check";
import type { FormField } from "../../composables/form/types";
import { resolveDmsComponent } from "../../composables/resolveDmsComponent";
import { escapeRegExp } from "../../build/composables/form/formEntryContext";
import type { validateFormState } from "../../build/composables/form/formValidation";
import DmsFormErrorText from "../../build/components/form/FormErrorText.vue";
import { useDeclaredFieldProps } from "../../build/composables/form/fieldComponentProps";

interface LocalizedFieldProps {
  field: FormField;
  initialValues?: Record<
    string,
    Parameters<typeof validateFormState>[1][string]
  >;
  loading: boolean;
  componentId: string;
  pageId: string;
}

const props = defineProps<LocalizedFieldProps>();

const fieldValue = defineModel<Record<string, string> | undefined>();

const { locale, locales } = useI18n();
const { processI18n } = useTranslation();

const isExpanded = ref(false);

function withAllLocales(current: Record<string, string>) {
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
    if (!value || !isObject(value)) {
      fieldValue.value = withAllLocales({});
      return;
    }
    if (locales.value.some((lang) => !(lang.code in value))) {
      fieldValue.value = withAllLocales(value);
    }
  },
  { immediate: true },
);

const EMPTY_TEXT = "";
const localeValues = computed<Record<string, string>>(() =>
  fieldValue.value && isObject(fieldValue.value) ? fieldValue.value : {},
);

function setLocaleValue(code: string, value: string): void {
  const current = fieldValue.value;
  if (current && isObject(current)) {
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

const component = computed(() => {
  const name = props.field.component.componentName;
  return name ? resolveDmsComponent(name) || name : null;
});
const rendered = computed(() => (showDisplay.value ? null : component.value));

const otherLocales = computed(() =>
  locales.value.filter((lang) => lang.code !== locale.value),
);
const mainErrorPattern = computed(
  () =>
    new RegExp(
      `^${escapeRegExp(props.field.id)}(\\.${escapeRegExp(locale.value)})?$`,
    ),
);

const formErrors = inject(formErrorsInjectionKey, null);

const hasMainError = computed(
  () =>
    !!formErrors?.value.some((error) =>
      mainErrorPattern.value.test(error.name ?? ""),
    ),
);
watch(
  () => formErrors?.value ?? [],
  (errors) => {
    const isTranslationInvalid = otherLocales.value.some((lang) =>
      errors.some((error) => error.name === `${props.field.id}.${lang.code}`),
    );
    if (isTranslationInvalid) isExpanded.value = true;
  },
);

const { isReady, offer } = await useDeclaredFieldProps(rendered);
const shared = computed(() => ({
  loading: props.loading,
  componentId: props.componentId,
  pageId: props.pageId,
}));
const mainOffered = computed(() => {
  const initial = props.initialValues?.[props.field.id];
  return offer({
    ...shared.value,
    initialValue:
      isObject(initial) && initial !== null ? initial[locale.value] : undefined,
  });
});
const translationOffered = computed(() => offer(shared.value));
</script>

<template>
  <div class="w-full space-y-2">
    <!-- The error sits right under the control, above the toggle. -->
    <div class="relative">
      <UFormField
        :name="field.id"
        :error-pattern="mainErrorPattern"
        :data-field="field.id"
        :help="field.hint ? processI18n(field.hint) : undefined"
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
          :is="component"
          v-else-if="component && isReady"
          :id="field.id"
          :model-value="localeValues[locale] ?? EMPTY_TEXT"
          :disabled="field.disabled"
          class="w-full"
          :class="{ 'opacity-75': field.disabled }"
          v-bind="{ ...mainOffered, ...field.component.options }"
          @update:model-value="setLocaleValue(locale, $event)"
        />
        <template v-if="hasMainError" #error="{ error }">
          <DmsFormErrorText :error />
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
                    :is="component"
                    v-else-if="component && isReady"
                    :id="`${field.id}_${lang.code}`"
                    :model-value="localeValues[lang.code] ?? EMPTY_TEXT"
                    :disabled="field.disabled"
                    class="w-full"
                    :class="{ 'opacity-75': field.disabled }"
                    v-bind="{
                      ...translationOffered,
                      ...field.component.options,
                    }"
                    @update:model-value="setLocaleValue(lang.code, $event)"
                  />
                  <template #error="{ error }">
                    <DmsFormErrorText :error />
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
