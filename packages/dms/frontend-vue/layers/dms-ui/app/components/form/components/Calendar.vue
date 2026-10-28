<script setup lang="ts" generic="R extends boolean, M extends boolean">
import type {
  CalendarProps,
  CalendarSlots,
} from "@nuxt/ui/components/Calendar.vue";
import { useForwardPropsEmits } from "reka-ui";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { FIELD_RING_INVALID_CLASS } from "../../../build/utils/fieldTrigger";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import {
  parseDate,
  fromDate,
  toCalendarDate,
  type CalendarDate,
} from "@internationalized/date";

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

type DateValue =
  | CalendarDate
  | StrictDateRange
  | string
  | (string | Date | CalendarDate)[]
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
  value: string | Date | CalendarDate,
): CalendarDate;
function convertToCalendarDate(
  value: string | Date | CalendarDate | undefined,
): CalendarDate | undefined;
function convertToCalendarDate(
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

function convertModelValue(value: DateValue): DateValue {
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
} = useFormField(
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The generic form-field parameter extraction excludes Calendar's concrete size and color values; retain the unchecked adapter.
  props as Parameters<typeof useFormField>[0],
);
const invalid = computed(() => fieldColor.value === "error");

function toBoundDate(value: string | undefined): CalendarDate | undefined {
  return value ? convertIsoStringToCalendarDate(value) : undefined;
}

const convertedProps = computed(() => {
  const { minDate: _minDate, maxDate: _maxDate, ...calendarProps } = props;
  return {
    ...calendarProps,
    color: calendarProps.color === "error" ? undefined : calendarProps.color,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- CalendarProps admits date-time and zoned variants outside the local model union; preserve their unchecked conversion passthrough.
    modelValue: convertModelValue(calendarProps.modelValue as DateValue),
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

function forwardEmit(
  event: EmitEvent,
  value: Parameters<typeof isObject>[0],
): void {
  if (event === "update:modelValue" && value) {
    if (Array.isArray(value)) {
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
    } else {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The declared model emit excludes this unchecked passthrough branch's arbitrary values; inference and the emit owner cannot establish a valid string here.
      emits("update:modelValue", value as string | null | undefined);
    }
  } else {
    // SAFETY: useForwardPropsEmits forwards event names and arguments unchanged; this widens the call surface without changing the actual emitter.
    const forwardEvent = emits as (event: string, ...args: unknown[]) => void;
    forwardEvent(event, value);
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
