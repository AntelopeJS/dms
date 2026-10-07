<script setup lang="ts" generic="R extends boolean, M extends boolean">
import type {
  CalendarProps,
  CalendarSlots,
} from "@nuxt/ui/components/Calendar.vue";
import { useForwardPropsEmits } from "reka-ui";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { FIELD_RING_INVALID_CLASS } from "../../../build/utils/fieldTrigger";
import {
  parseDate,
  fromDate,
  toCalendarDate,
  type CalendarDate,
} from "@internationalized/date";

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
  if (Array.isArray(value)) {
    return value.map(convertToCalendarDate) as CalendarDate[];
  }
  return value;
}

// An inline calendar has no border: an invalid field rings it.
const {
  color: fieldColor,
  ariaAttrs,
  emitFormChange,
} = useFormField(
  // Its props typing knows only Nuxt UI colours and sizes; it reads `id`,
  // `color` and `disabled` from these.
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
    color:
      (calendarProps.color as string) === "error"
        ? undefined
        : calendarProps.color,
    modelValue: convertModelValue(calendarProps.modelValue as DateValue),
  };
});

// Bound on the calendar itself: forwarding only passes props this component
// was given, and the bounds arrive as `minDate` / `maxDate`.
const minValue = computed(() => props.minValue ?? toBoundDate(props.minDate));
const maxValue = computed(() => props.maxValue ?? toBoundDate(props.maxDate));

type EmitEvent = string;
type EmitValue = unknown;

const wrappedEmits = (event: EmitEvent, value: EmitValue) => {
  forwardEmit(event, value);
  // After the update: the field re-validates its new value.
  if (event === "update:modelValue") emitFormChange();
};

function forwardEmit(event: EmitEvent, value: EmitValue): void {
  if (event === "update:modelValue" && value) {
    if (Array.isArray(value)) {
      const isoStrings = (value as CalendarDate[]).map((date) =>
        date.toString(),
      );
      emits("update:modelValue", isoStrings);
    } else if (
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
}

const forwarded = useForwardPropsEmits(
  convertedProps,
  wrappedEmits as typeof emits,
);
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
