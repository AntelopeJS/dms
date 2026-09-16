<script setup lang="ts" generic="R extends boolean, M extends boolean">
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

interface StrictDateRange {
  start: CalendarDate;
  end: CalendarDate;
}

interface StringDateRange {
  start: string;
  end: string;
}

interface NativeDateRange {
  start: Date;
  end: Date;
}

type DateValue = CalendarDate | StrictDateRange | string | null | undefined;

const props = defineProps<CalendarProps<R, M>>();
const emits = defineEmits<{
  "update:modelValue": [
    value: string | { start: string; end: string } | null | undefined,
  ];
  "update:placeholder": [date: CalendarDate];
  "update:startValue": [date: CalendarDate | undefined];
}>();
defineSlots<CalendarSlots>();

function convertIsoStringToCalendarDate(value: string): CalendarDate {
  return parseDate(value.split("T")[0]!);
}

function convertDateRangeValue(
  rangeValue: StringDateRange | StrictDateRange | NativeDateRange,
): StrictDateRange | undefined {
  if (isString(rangeValue.start) && isString(rangeValue.end)) {
    return {
      start: convertIsoStringToCalendarDate(rangeValue.start),
      end: convertIsoStringToCalendarDate(rangeValue.end),
    };
  }
  if (rangeValue.start instanceof Date && rangeValue.end instanceof Date) {
    return {
      start: toCalendarDate(fromDate(rangeValue.start, "UTC")),
      end: toCalendarDate(fromDate(rangeValue.end, "UTC")),
    };
  }
  return undefined;
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
    return convertDateRangeValue(value) ?? value;
  }
  return value;
}

const convertedProps = computed(() => ({
  ...props,
  modelValue: convertModelValue(props.modelValue as DateValue),
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
      const startIso = dateRange.start.toString();
      const endIso = dateRange.end.toString();
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
  convertedProps,
  wrappedEmits as typeof emits,
);
</script>

<template>
  <UCalendar v-bind="forwarded" />
</template>
