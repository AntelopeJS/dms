<script setup lang="ts" generic="R extends boolean, M extends boolean">
import { formatDate } from "#dms-core/app/utils/formatter";
import type {
  CalendarProps,
  CalendarSlots,
} from "@nuxt/ui/components/Calendar.vue";
import { useForwardPropsEmits } from "reka-ui";
import {
  parseDate,
  fromDate,
  toCalendarDate,
  type CalendarDate,
} from "@internationalized/date";
import { reactivePick } from "@vueuse/core";

// Mid-selection, the range calendar emits a range whose end is still unset.
interface StrictDateRange {
  start: CalendarDate | undefined;
  end: CalendarDate | undefined;
}

interface StringDateRange {
  start: string | undefined;
  end: string | undefined;
}

interface NativeDateRange {
  start: Date | undefined;
  end: Date | undefined;
}

type DateValue = CalendarDate | StrictDateRange | string | null | undefined;

type DatePickerProps = Omit<CalendarProps<R, M>, "modelValue">;

const props = defineProps<DatePickerProps>();
const emits = defineEmits<{
  "update:modelValue": [
    value:
      | string
      | { start: string | undefined; end: string | undefined }
      | null
      | undefined,
  ];
  "update:placeholder": [date: CalendarDate];
  "update:startValue": [date: CalendarDate | undefined];
}>();
defineSlots<CalendarSlots>();

const { locale, t } = useI18n();

const modelValue = defineModel<string | undefined | null>();

function convertIsoStringToCalendarDate(value: string): CalendarDate {
  return parseDate(value.split("T")[0]!);
}

function convertDateRangeBound(
  value: string | Date | CalendarDate | undefined,
): CalendarDate | undefined {
  if (isString(value)) {
    return convertIsoStringToCalendarDate(value);
  }
  if (value instanceof Date) {
    return toCalendarDate(fromDate(value, "UTC"));
  }
  return value;
}

function convertDateRangeValue(
  rangeValue: StringDateRange | StrictDateRange | NativeDateRange,
): StrictDateRange {
  return {
    start: convertDateRangeBound(rangeValue.start),
    end: convertDateRangeBound(rangeValue.end),
  };
}

function isDateRangeValue(
  value: unknown,
): value is StringDateRange | StrictDateRange | NativeDateRange {
  return (
    isObject(value) && value !== null && "start" in value && "end" in value
  );
}

function convertModelValue(value: DateValue): DateValue {
  if (isString(value)) {
    return convertIsoStringToCalendarDate(value);
  }
  if (isDateRangeValue(value)) {
    return convertDateRangeValue(value);
  }
  return value;
}

const convertedProps = computed(() => ({
  ...props,
  modelValue: convertModelValue(modelValue.value as DateValue),
}));

type EmitEvent = string;
type EmitValue = unknown;

const wrappedEmits = (event: EmitEvent, value: EmitValue) => {
  if (event === "update:modelValue" && value) {
    if (
      isObject(value) &&
      "year" in value &&
      "month" in value &&
      "day" in value
    ) {
      const isoString = (value as unknown as CalendarDate).toString();
      emits("update:modelValue", isoString);
    } else if (isObject(value) && "start" in value && "end" in value) {
      const dateRange = value as unknown as StrictDateRange;
      const startIso = dateRange.start?.toString();
      const endIso = dateRange.end?.toString();
      emits("update:modelValue", { start: startIso, end: endIso });
    } else {
      emits("update:modelValue", value as string | null | undefined);
    }
  } else {
    const forwardEvent = emits as (event: string, ...args: unknown[]) => void;
    forwardEvent(event, value);
  }
};

const forwarded = useForwardPropsEmits(
  convertedProps as unknown as ComputedRef<CalendarProps<R, M>>,
  wrappedEmits as typeof emits,
);
const buttonProps = reactivePick(props, "disabled");

function formatDateLabel(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  // A CalendarDate stringifies to its ISO date.
  const date = value instanceof Date ? value : String(value);
  return formatDate(date, locale.value) ?? undefined;
}

// Range mode holds a { start, end } object and multiple mode an array, which
// formatDate cannot read as a single date.
const label = computed(() => {
  const value: unknown = modelValue.value;
  if (Array.isArray(value)) {
    return value.map(formatDateLabel).filter(Boolean).join(", ") || undefined;
  }
  if (isDateRangeValue(value)) {
    return (
      [formatDateLabel(value.start), formatDateLabel(value.end)]
        .filter(Boolean)
        .join(" – ") || undefined
    );
  }
  return formatDateLabel(value);
});
</script>

<template>
  <UPopover>
    <UButton
      :label="label ?? t('dms.form.select_date')"
      :ui="{
        label: label ? 'text-default' : 'text-dimmed',
      }"
      v-bind="buttonProps"
      variant="outline"
      color="neutral"
      trailing
      trailing-icon="i-ph-caret-down"
      block
    />

    <template #content>
      <UCalendar v-bind="forwarded" />
    </template>
  </UPopover>
</template>
