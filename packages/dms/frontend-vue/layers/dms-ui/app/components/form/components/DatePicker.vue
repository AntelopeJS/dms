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

type DatePickerProps = Omit<CalendarProps<R, M>, "modelValue">;

const props = defineProps<DatePickerProps>();
const emits = defineEmits<{
  "update:modelValue": [
    value: string | { start: string; end: string } | null | undefined,
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
  convertedProps as unknown as ComputedRef<CalendarProps<R, M>>,
  wrappedEmits as typeof emits,
);
const buttonProps = reactivePick(props, "disabled");
</script>

<template>
  <UPopover>
    <UButton
      :label="
        modelValue
          ? (formatDate(modelValue, locale) ?? undefined)
          : t('dms.form.select_date')
      "
      :ui="{
        label: modelValue ? 'text-default' : 'text-dimmed',
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
