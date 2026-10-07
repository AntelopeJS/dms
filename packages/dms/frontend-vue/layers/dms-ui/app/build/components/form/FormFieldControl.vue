<script setup lang="ts">
import type {
  FormField,
  FormFieldReadonly,
} from "../../../composables/form/types/field";
import {
  FORM_ENTRY_CONTEXT_KEY,
  fieldErrorPattern,
} from "../../composables/form/formEntryContext";
import { formErrorsInjectionKey } from "@nuxt/ui/composables/useFormField";
import DmsFormErrorText from "./FormErrorText.vue";
import DmsFormFieldNotes from "./FormFieldNotes.vue";

interface FormFieldControlProps {
  field: FormField;
}

const props = defineProps<FormFieldControlProps>();
const context = inject(FORM_ENTRY_CONTEXT_KEY)!;
const { state, initialValues, loading } = context;
const { processI18n } = useTranslation();

const isDisabled = computed(() => context.isFieldDisabled(props.field));
const component = computed(() => {
  const name = props.field.component.componentName;
  return name ? resolveDmsComponent(name) || name : null;
});
// The hint under the control, which describes it (`aria-describedby`).
const hint = computed(() =>
  props.field.hint ? processI18n(props.field.hint) : undefined,
);
// UFormField shows its error slot whenever one is given, in the hint's
// place: it gets one only while the field holds an error.
const formErrors = inject(formErrorsInjectionKey, null);
const hasError = computed(() => {
  const pattern = fieldErrorPattern(props.field.id);
  return !!formErrors?.value.some((error) => pattern.test(error.name ?? ""));
});
// What a read-only field shows beside its value: a pill, a link.
const readonly = computed<FormFieldReadonly>(() =>
  typeof props.field.readonly === "object" ? props.field.readonly : {},
);
</script>

<template>
  <div class="grid min-w-0 gap-1.5">
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
      :help="hint"
    >
      <div
        v-if="isDisabled && !!field.type"
        class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
      >
        <DmsDisplay
          :model-value="state[field.id]"
          :type="field.type"
          :loading
          class="min-w-0"
          v-bind="field.component.options || {}"
        />
        <DmsStatusPill
          v-if="readonly.badge"
          :tone="readonly.badge.tone"
          :label="processI18n(readonly.badge.label)"
        />
        <DmsAutoLink
          v-if="readonly.link"
          :to="readonly.link.to"
          class="text-primary ms-auto text-[12.5px] font-medium"
        >
          {{ processI18n(readonly.link.label) }}
        </DmsAutoLink>
      </div>
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
      <template v-if="hasError" #error="{ error }">
        <DmsFormErrorText :error />
      </template>
    </UFormField>

    <DmsFormFieldNotes :field />
  </div>
</template>
