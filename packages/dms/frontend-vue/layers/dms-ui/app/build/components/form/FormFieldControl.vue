<script setup lang="ts">
import type { FormField } from "../../../composables/form/types/field";
import {
  FORM_ENTRY_CONTEXT_KEY,
  fieldErrorPattern,
} from "../../composables/form/formEntryContext";

interface FormFieldControlProps {
  field: FormField;
}

const props = defineProps<FormFieldControlProps>();
const context = inject(FORM_ENTRY_CONTEXT_KEY)!;
const { state, initialValues, loading } = context;

const isDisabled = computed(() => context.isFieldDisabled(props.field));
const component = computed(() => {
  const name = props.field.component.componentName;
  return name ? resolveDmsComponent(name) || name : null;
});
</script>

<template>
  <DmsLocalizedField
    v-if="field.localized"
    v-model="state[field.id] as Record<string, string> | undefined"
    :field
    :initial-values="initialValues"
    :loading
    :component-id="context.componentId"
    :page-id="context.pageId"
  />

  <UFormField
    v-else
    :name="field.id"
    :error-pattern="fieldErrorPattern(field.id)"
    :data-field="field.id"
  >
    <DmsDisplay
      v-if="isDisabled && !!field.type"
      :model-value="state[field.id]"
      :type="field.type"
      :loading
      class="w-full"
      v-bind="field.component.options || {}"
    />
    <Component
      :is="component"
      v-else
      :id="field.id"
      v-model="state[field.id]"
      :initial-value="initialValues?.[field.id]"
      :loading
      :disabled="isDisabled"
      :component-id="context.componentId"
      :page-id="context.pageId"
      :route-params="context.routeParams"
      class="w-full"
      v-bind="field.component.options || {}"
    />
    <template #error="{ error }">
      <template v-if="error">
        <UIcon name="i-ph-warning-circle" class="size-3.5 shrink-0" />
        {{ error }}
      </template>
    </template>
  </UFormField>
</template>
