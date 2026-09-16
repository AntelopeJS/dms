<script setup lang="ts">
import type { FormField } from "../../composables/form/types";
import { resolveDmsComponent } from "../../composables/resolveDmsComponent";

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

const toggleTranslations = () => {
  isExpanded.value = !isExpanded.value;
};

const showDisplay = computed(
  () => !!props.field.disabled && !!props.field.type,
);
</script>

<template>
  <div class="w-full space-y-2">
    <UFormField :name="`${field.id}.${locale}`" class="relative">
      <DmsDisplay
        v-if="showDisplay && fieldValue"
        :model-value="fieldValue[locale]"
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
        v-else-if="field.component.componentName && fieldValue"
        :id="field.id"
        v-model="fieldValue[locale]"
        :initial-value="
          (initialValues?.[field.id] as Record<string, unknown> | undefined)?.[
            locale
          ]
        "
        :loading
        :disabled="field.disabled"
        :component-id="props.componentId"
        :page-id="props.pageId"
        class="w-full"
        :class="{ 'opacity-75': field.disabled }"
        v-bind="field.component.options || {}"
      />
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
    </UFormField>

    <UCollapsible v-model:open="isExpanded" :ui="{ content: 'p-0.5' }">
      <template #content>
        <UCard :ui="{ body: 'sm:p-4' }">
          <div class="space-y-4">
            <div
              v-for="lang in locales"
              :key="lang.code"
              class="flex items-start gap-3"
            >
              <div class="flex min-w-[140px] items-center gap-2 pt-2">
                <span class="text-default text-sm font-medium">
                  {{ lang.name }}
                </span>
              </div>

              <div class="flex-1">
                <UFormField :name="`${field.id}.${lang.code}`">
                  <DmsDisplay
                    v-if="showDisplay && fieldValue"
                    :model-value="fieldValue[lang.code]"
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
                    v-else-if="field.component.componentName && fieldValue"
                    :id="`${field.id}_${lang.code}`"
                    v-model="fieldValue[lang.code]"
                    :loading
                    :disabled="field.disabled"
                    :component-id="props.componentId"
                    :page-id="props.pageId"
                    class="w-full"
                    :class="{ 'opacity-75': field.disabled }"
                    v-bind="field.component.options || {}"
                  />
                </UFormField>
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </UCollapsible>
  </div>
</template>
