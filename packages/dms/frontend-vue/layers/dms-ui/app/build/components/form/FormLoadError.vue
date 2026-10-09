<script setup lang="ts">
import DmsEmptyState from "../../../components/empty-state/EmptyState.vue";
import type { FormLoadFailure } from "../../composables/form/formRecordLoad";

// What a form shows instead of its fields when the record it edits did not
// load: empty fields would read as the record, and a save from them would
// replace values the form never showed.
interface FormLoadErrorProps {
  failure: FormLoadFailure;
  /** Set while the record is being loaded again. */
  retrying?: boolean;
}

interface FormLoadErrorEmits {
  (e: "retry"): void;
}

const props = withDefaults(defineProps<FormLoadErrorProps>(), {
  retrying: false,
});
const emit = defineEmits<FormLoadErrorEmits>();

const { t } = useI18n();
</script>

<template>
  <DmsEmptyState
    size="md"
    :variant="props.failure === 'forbidden' ? 'no-access' : 'error'"
    :title="t(`dms.form.load_error.${props.failure}_title`)"
    :description="t(`dms.form.load_error.${props.failure}_description`)"
  >
    <template #actions>
      <UButton
        :label="t('dms.form.load_error.retry')"
        icon="i-ph-arrows-clockwise"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="props.retrying"
        @click="emit('retry')"
      />
    </template>
  </DmsEmptyState>
</template>
