<script setup lang="ts">
import DmsDatePicker from "./DatePicker.vue";

interface DatePickerRangeProps {
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
}

const props = defineProps<DatePickerRangeProps>();

type RangeValue = [string | undefined, string | undefined] | undefined;

const modelValue = defineModel<RangeValue>();

const startValue = computed({
  get: () => modelValue.value?.[0],
  set: (value: string | undefined | null) => {
    emitRange(value ?? undefined, endValue.value);
  },
});

const endValue = computed({
  get: () => modelValue.value?.[1],
  set: (value: string | undefined | null) => {
    emitRange(startValue.value, value ?? undefined);
  },
});

function emitRange(start: string | undefined, end: string | undefined) {
  if (!start && !end) {
    modelValue.value = undefined;
    return;
  }
  modelValue.value = [start, end];
}

const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2">
    <DmsDatePicker
      v-model="startValue"
      :min-date="props.minDate"
      :max-date="endValue || props.maxDate"
      :disabled="props.disabled"
      class="flex-1"
    />
    <span class="text-dimmed shrink-0 text-sm">
      {{ t("dms.table.between_separator") }}
    </span>
    <DmsDatePicker
      v-model="endValue"
      :min-date="startValue || props.minDate"
      :max-date="props.maxDate"
      :disabled="props.disabled"
      class="flex-1"
    />
  </div>
</template>
