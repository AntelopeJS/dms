<script setup lang="ts" generic="R extends boolean, M extends boolean">
import type {
  CalendarProps,
  CalendarSlots,
} from "@nuxt/ui/components/Calendar.vue";
import { useForwardPropsEmits } from "reka-ui";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { FIELD_RING_INVALID_CLASS } from "../../../build/utils/fieldTrigger";
import { toCalendarDay } from "../../../build/utils/calendarDay";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import {
  parseDate,
  fromDate,
  toCalendarDate,
  type CalendarDate,
  type CalendarDateTime,
  type ZonedDateTime,
} from "@internationalized/date";

/** A day as the calendar holds it, with or without a time of day. */
type CalendarValue = CalendarDate | CalendarDateTime | ZonedDateTime;

interface StrictDateRange {
  start: CalendarValue | undefined;
  end: CalendarValue | undefined;
}

interface StringDateRange {
  start: string | undefined;
  end: string | undefined;
}

interface NativeDateRange {
  start: Date | undefined;
  end: Date | undefined;
}

type DateValue =
  | CalendarValue
  | StrictDateRange
  | string
  | (string | Date | CalendarValue)[]
  | null
  | undefined;

interface DmsCalendarProps extends CalendarProps<R, M> {
  /** Earliest day that can be picked (ISO date). */
  minDate?: string;
  /** Latest day that can be picked (ISO date). */
  maxDate?: string;
}

const props = defineProps<DmsCalendarProps>();
const emits = defineEmits<{
  "update:modelValue": [
    value:
      | string
      | { start: string | undefined; end: string | undefined }
      | string[]
      | null
      | undefined,
  ];
  "update:placeholder": [date: CalendarDate];
  "update:startValue": [date: CalendarDate | undefined];
}>();
defineSlots<CalendarSlots>();

const { weekStartsOn } = useUserRegionalPreferences();

function convertIsoStringToCalendarDate(value: string): CalendarDate {
  return parseDate(value.split("T")[0]!);
}

function convertToCalendarDate(
  value: string | Date | CalendarValue,
): CalendarValue;
function convertToCalendarDate(
  value: string | Date | CalendarValue | undefined,
): CalendarValue | undefined;
function convertToCalendarDate(
  value: string | Date | CalendarValue | undefined,
): CalendarValue | undefined {
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
    start: convertToCalendarDate(rangeValue.start),
    end: convertToCalendarDate(rangeValue.end),
  };
}

function isDateRangeValue(
  value: Parameters<typeof isObject>[0],
): value is StringDateRange | StrictDateRange | NativeDateRange {
  return (
    isObject(value) && value !== null && "start" in value && "end" in value
  );
}

function convertModelValue(
  value: DmsCalendarProps["modelValue"] | DateValue,
): DateValue {
  if (isString(value)) {
    return convertIsoStringToCalendarDate(value);
  }
  if (isDateRangeValue(value)) {
    return convertDateRangeValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => convertToCalendarDate(entry));
  }
  return value;
}

const {
  color: fieldColor,
  ariaAttrs,
  emitFormChange,
} = useFormField<DmsCalendarProps>(props);
const invalid = computed(() => fieldColor.value === "error");

function toBoundDate(value: string | undefined): CalendarDate | undefined {
  return value ? convertIsoStringToCalendarDate(value) : undefined;
}

const convertedProps = computed(() => {
  const { minDate: _minDate, maxDate: _maxDate, ...calendarProps } = props;
  return {
    ...calendarProps,
    color: calendarProps.color === "error" ? undefined : calendarProps.color,
    modelValue: convertModelValue(calendarProps.modelValue),
  };
});

const minValue = computed(() => props.minValue ?? toBoundDate(props.minDate));
const maxValue = computed(() => props.maxValue ?? toBoundDate(props.maxDate));

type EmitEvent = string;

const wrappedEmits = (
  event: EmitEvent,
  value: Parameters<typeof forwardEmit>[1],
) => {
  forwardEmit(event, value);

  if (event === "update:modelValue") emitFormChange();
};

function forwardModelValue(value: Parameters<typeof isObject>[0]): void {
  if (value === null || value === undefined || isString(value)) {
    emits("update:modelValue", value);
  } else if (Array.isArray(value)) {
    const isoStrings = value.map((date) => date.toString());
    emits("update:modelValue", isoStrings);
  } else if (
    isObject(value) &&
    "year" in value &&
    "month" in value &&
    "day" in value
  ) {
    const isoString = value.toString();
    emits("update:modelValue", isoString);
  } else if (isObject(value) && "start" in value && "end" in value) {
    const startIso = value.start?.toString();
    const endIso = value.end?.toString();
    emits("update:modelValue", { start: startIso, end: endIso });
  }
}

function forwardEmit(
  event: EmitEvent,
  value: Parameters<typeof isObject>[0],
): void {
  if (event === "update:modelValue") {
    forwardModelValue(value);
    return;
  }
  const day = toCalendarDay(value);
  if (event === "update:placeholder" && day) {
    emits("update:placeholder", day);
  } else if (event === "update:startValue" && (day || value === undefined)) {
    emits("update:startValue", day);
  }
}

const forwarded = useForwardPropsEmits(convertedProps, wrappedEmits);
</script>

<template>
  <UCalendar
    v-bind="{ ...forwarded, ...ariaAttrs }"
    :week-starts-on="props.weekStartsOn ?? weekStartsOn"
    :min-value="minValue"
    :max-value="maxValue"
    :class="invalid && FIELD_RING_INVALID_CLASS"
  />
</template>
