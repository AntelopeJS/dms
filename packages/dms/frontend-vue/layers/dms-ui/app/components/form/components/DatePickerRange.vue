<script setup lang="ts">
import { useFormField } from "@nuxt/ui/composables/useFormField";
import DmsDatePicker from "./DatePicker.vue";

interface DatePickerRangeProps {
  id?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  /** `error` marks both ends invalid (UFormField sets it from the field). */
  color?: string;
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

// Both pickers show the field's error.
const { color: fieldColor } = useFormField(
  // Its props typing knows only Nuxt UI colours and sizes; it reads `id`,
  // `color` and `disabled` from these.
  props as Parameters<typeof useFormField>[0],
);
const pickerColor = computed(() =>
  fieldColor.value === "error" ? "error" : undefined,
);
</script>

<template>
  <div class="flex items-center gap-2">
    <DmsDatePicker
      :id="props.id"
      v-model="startValue"
      :color="pickerColor"
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
      :color="pickerColor"
      :min-date="startValue || props.minDate"
      :max-date="props.maxDate"
      :disabled="props.disabled"
      class="flex-1"
    />
  </div>
</template>
