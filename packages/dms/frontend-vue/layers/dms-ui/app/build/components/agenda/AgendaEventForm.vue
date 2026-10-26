<script setup lang="ts">
import { computed, ref } from "vue";
import AgendaFieldInput from "./AgendaFieldInput.vue";
import {
  isFieldShown,
  type AgendaFormField,
  type AgendaFormValues,
} from "../../composables/agenda/agendaForm";
import {
  AGENDA_FORM_REFUSED,
  type AgendaDetailsApi,
} from "../../composables/agenda/useAgendaDetails";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The form of an event: the built-in fields and the block's own `fields`
 * (shown while their `visibleWhen` holds), each with its label, hint and
 * the error the form model gives it. Saving hands the values to the details
 * (`details.save`), which places one `create` or `update` change.
 */
interface AgendaEventFormProps {
  details: AgendaDetailsApi;
  /** Ids prefix, unique per open form. */
  formId: string;
}

const props = defineProps<AgendaEventFormProps>();
const { t } = useI18n();
const { processText } = useComposedText();

const values = ref<AgendaFormValues>(props.details.initialValues());
const shownFields = computed(() =>
  props.details.fields.value.filter((field) =>
    isFieldShown(field, values.value),
  ),
);
const inputId = (field: AgendaFormField) => `${props.formId}-${field.id}`;
const errorOf = (field: AgendaFormField) => {
  const error = props.details.errors.value[field.id];
  return error ? processText(error) : "";
};
const setValue = (field: AgendaFormField, value: unknown) => {
  values.value = { ...values.value, [field.id]: value };
  props.details.touch(field.id, value);
};
const refusal = computed(() => {
  const error = props.details.errors.value[AGENDA_FORM_REFUSED];
  return error ? processText(error) : "";
});
const isAllDay = computed(() => Boolean(values.value.allDay));
const submit = () => props.details.save(values.value);
</script>

<template>
  <form
    class="flex flex-col gap-4"
    novalidate
    data-agenda-event-form
    @submit.prevent="submit"
  >
    <div
      v-for="field in shownFields"
      :key="field.id"
      class="flex flex-col gap-1.5"
      :data-agenda-field="field.id"
    >
      <label :for="inputId(field)" class="text-default text-sm font-medium">
        {{ processText(field.label) }}
        <span v-if="field.required" class="text-error" aria-hidden="true">
          *
        </span>
      </label>
      <AgendaFieldInput
        :id="inputId(field)"
        :field="field"
        :model-value="values[field.id]"
        :all-day="isAllDay"
        :time-zone="props.details.timeZone.value"
        :invalid="Boolean(errorOf(field))"
        :aria-describedby="
          errorOf(field) ? `${inputId(field)}-error` : undefined
        "
        @update:model-value="setValue(field, $event)"
      />
      <p v-if="field.hint && !errorOf(field)" class="text-muted text-xs">
        {{ processText(field.hint) }}
      </p>
      <p
        v-if="errorOf(field)"
        :id="`${inputId(field)}-error`"
        class="text-error text-xs"
        role="alert"
      >
        {{ errorOf(field) }}
      </p>
    </div>
    <p
      v-if="refusal"
      class="text-error text-sm"
      role="alert"
      data-agenda-form-refused
    >
      {{ refusal }}
    </p>
    <div class="flex justify-end gap-2 pt-1">
      <UButton
        color="neutral"
        variant="outline"
        :label="t('dms.agenda.details.cancel')"
        @click="props.details.cancel()"
      />
      <UButton
        type="submit"
        :loading="props.details.saving.value"
        :label="
          props.details.isNew.value
            ? t('dms.agenda.details.create')
            : t('dms.agenda.details.save')
        "
        data-agenda-form-save
      />
    </div>
  </form>
</template>
