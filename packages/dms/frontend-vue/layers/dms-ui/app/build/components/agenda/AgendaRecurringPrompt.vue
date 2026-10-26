<script setup lang="ts">
import { inject, ref } from "vue";
import { DMS_CONTAINER_KEY } from "../../composables/containers/context";
import type { AgendaRecurringScope } from "../../../types/full-agenda";

/**
 * The body of the modal asking which part of a recurring event an edit or a
 * delete applies to: this occurrence, or the whole series. Answers through
 * `success`; Cancel closes the modal with no answer.
 */
interface AgendaRecurringPromptProps {
  kind: "update" | "delete";
  containerId?: string;
}

const props = defineProps<AgendaRecurringPromptProps>();
const emit = defineEmits<{ success: [scope: AgendaRecurringScope] }>();
const container = inject(DMS_CONTAINER_KEY, undefined);
const { t } = useI18n();

const scope = ref<AgendaRecurringScope>("occurrence");

/** A choice of the prompt. */
interface ScopeChoice {
  value: AgendaRecurringScope;
  label: string;
  description: string;
}

const choices: ScopeChoice[] = [
  {
    value: "occurrence",
    label: t("dms.agenda.details.scope_occurrence"),
    description: t("dms.agenda.details.scope_occurrence_hint"),
  },
  {
    value: "series",
    label: t("dms.agenda.details.scope_series"),
    description: t("dms.agenda.details.scope_series_hint"),
  },
];
</script>

<template>
  <form
    class="flex flex-col gap-4"
    data-agenda-recurring-prompt
    @submit.prevent="emit('success', scope)"
  >
    <URadioGroup
      v-model="scope"
      :items="choices"
      value-key="value"
      variant="card"
      :aria-label="t('dms.agenda.details.recurring_title')"
    />
    <div class="flex justify-end gap-2">
      <UButton
        color="neutral"
        variant="outline"
        :label="t('dms.agenda.details.cancel')"
        @click="container?.close()"
      />
      <UButton
        type="submit"
        :color="props.kind === 'delete' ? 'error' : 'primary'"
        :label="
          props.kind === 'delete'
            ? t('dms.agenda.details.delete')
            : t('dms.agenda.details.apply')
        "
      />
    </div>
  </form>
</template>
