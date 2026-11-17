<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfirmFrom } from "#dms-ui/app/composables/confirm/useConfirmFrom";
import { useControlError } from "#dms-ui/app/composables/form/useControlError";
import { useEnclosingForm } from "#dms-ui/app/composables/form/useEnclosingForm";
import type { InputNumberAdjustment } from "#dms-ui/app/types/input-number";
import DmsInputNumber from "#dms-ui/app/components/form/components/InputNumber.vue";

/**
 * A module's own input for a retention in days, the `inputComponent` of the
 * "Custom input" demo. It draws `DmsInputNumber` and tells why a typed value
 * was adjusted, refuses a value that is not whole weeks (`useControlError`),
 * asks before a save that lowers the retention (`useEnclosingForm`
 * validator, then `useConfirmFrom`), and focuses another field on demand.
 */

interface Props {
  id?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  /**
   * Route answering the confirmation of a lowered retention, `{{row.days}}`
   * the new value. The demo page's route when left out.
   */
  confirmUrl?: string;
}

const props = defineProps<Props>();
const model = defineModel<number | null>();

const DAYS_PER_WEEK = 7;
const NAME_FIELD = "name";
const LOWER_RETENTION_URL =
  "/api/form-custom-input/lower-retention?days={{row.days}}";

const form = useEnclosingForm();
const { report } = useControlError();
const { confirmFrom } = useConfirmFrom();
const { formatNumber } = useRegionalFormat();

const adjustment = ref<InputNumberAdjustment | null>(null);
let saved: number | null = null;
let confirmedValue: number | null = null;

function isWholeWeeks(value: number): boolean {
  return value % DAYS_PER_WEEK === 0;
}

watch(
  model,
  (value) => {
    if (saved === null && value != null) saved = value;
    if (value !== adjustment.value?.value) adjustment.value = null;
    report(
      value != null && !isWholeWeeks(value)
        ? "Use whole weeks: 7, 14, 21…"
        : undefined,
    );
  },
  { immediate: true },
);

function isLowered(value: typeof model.value): value is number {
  return value != null && saved !== null && value < saved;
}

async function askThenSubmit(days: number): Promise<void> {
  const confirmed = await confirmFrom(props.confirmUrl ?? LOWER_RETENTION_URL, {
    params: { days },
  });
  if (!confirmed || !form) return;
  confirmedValue = days;
  await form.submit();
}

form?.addValidator(() => {
  if (!isLowered(model.value) || confirmedValue === model.value) {
    saved = model.value ?? saved;
    return true;
  }
  void askThenSubmit(model.value);
  return false;
});

function focusName(): void {
  void form?.focusField(NAME_FIELD);
}
</script>

<template>
  <div class="grid gap-1.5">
    <div class="flex items-center gap-2">
      <DmsInputNumber
        :id="props.id"
        v-model="model"
        :min="props.min"
        :max="props.max"
        :step="1"
        :disabled="props.disabled"
        suffix="days"
        @adjust="adjustment = $event"
      />
      <UButton
        v-if="form"
        label="Jump to name"
        icon="i-ph-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="focusName"
      />
    </div>
    <p v-if="adjustment" class="text-muted text-xs" role="status">
      {{ formatNumber(adjustment.typed) }} →
      {{ formatNumber(adjustment.value) }} ({{ adjustment.reason }})
    </p>
  </div>
</template>
