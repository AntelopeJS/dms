<script setup lang="ts" generic="R extends boolean, M extends boolean">
import { formatDate } from "#dms-core/app/utils/formatter";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
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
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { useControlError } from "../../../build/composables/form/useControlError";
import {
  FIELD_TRIGGER_CLASS,
  FIELD_TRIGGER_INVALID_CLASS,
  FIELD_TRIGGER_UI,
} from "../../../utils/fieldTrigger";

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

interface DatePickerProps extends Omit<CalendarProps<R, M>, "modelValue"> {
  /** Id of the trigger, the control a field label points to. */
  id?: string;
  /** Earliest day that can be picked (ISO date). */
  minDate?: string;
  /** Latest day that can be picked (ISO date). */
  maxDate?: string;
  /**
   * `error` marks the field invalid, as UFormField does for the controls it
   * wraps; any other colour tints the calendar.
   */
  color?: CalendarProps<R, M>["color"] | "error";
}

const props = defineProps<DatePickerProps>();
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

const { locale, t } = useI18n();
const { weekStartsOn } = useUserRegionalPreferences();

// The picker holds calendar days, read as UTC midnights (see
// convertToCalendarDate): written in UTC, a day never shifts with the zone.
const DATE_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "2-digit",
  timeZone: "UTC",
};

const modelValue = defineModel<string | undefined | null>();

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
  // A range may also arrive as `[start, end]`, the list shape the date type
  // still accepts.
  if (props.range && Array.isArray(value)) {
    return convertDateRangeValue({
      start: value[0] as string | undefined,
      end: value[1] as string | undefined,
    });
  }
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

// The field state UFormField hands its control: the error border and aria
// attributes go on the trigger, picks and closes re-validate the field.
const {
  color: fieldColor,
  ariaAttrs,
  emitFormBlur,
  emitFormChange,
} = useFormField(
  // Its props typing knows only Nuxt UI colours and sizes; it reads `id`,
  // `color` and `disabled` from these.
  props as Parameters<typeof useFormField>[0],
);
const invalid = computed(() => fieldColor.value === "error");

// A range picked halfway (its start only) is no range, and the calendar
// drops that start once it closes: the field says the end is missing, until
// a whole range is picked or the field is cleared.
const RANGE_INCOMPLETE = "$dms.field_errors.range_incomplete";
const { report } = useControlError();
let isHalfPicked = false;

/** Follows a range being picked: its start alone, then both ends. */
function trackRangePick(value: unknown): void {
  if (value === null || value === undefined) {
    isHalfPicked = false;
    report(undefined);
    return;
  }
  const ends = value as Partial<StrictDateRange>;
  if (!ends.start) return;
  isHalfPicked = !ends.end;
  if (!isHalfPicked) report(undefined);
}

function onPickerToggle(open: boolean): void {
  if (open) return;
  if (props.range && isHalfPicked) report(RANGE_INCOMPLETE);
  emitFormBlur();
}

function toBoundDate(value: string | undefined): CalendarDate | undefined {
  return value ? convertIsoStringToCalendarDate(value) : undefined;
}

const convertedProps = computed(() => {
  const {
    id: _id,
    minDate: _minDate,
    maxDate: _maxDate,
    color,
    ...calendarProps
  } = props as DatePickerProps;
  return {
    ...calendarProps,
    color: color === "error" ? undefined : color,
    modelValue: convertModelValue(modelValue.value as DateValue),
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
  if (event === "update:modelValue" && props.range) trackRangePick(value);
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
  return formatDate(date, locale.value, DATE_LABEL_FORMAT) ?? undefined;
}

// Range mode holds a { start, end } object and multiple mode an array, which
// formatDate cannot read as a single date.
const label = computed(() => {
  const value: unknown = modelValue.value;
  if (props.range && Array.isArray(value)) {
    return (
      [formatDateLabel(value[0]), formatDateLabel(value[1])]
        .filter(Boolean)
        .join(" – ") || undefined
    );
  }
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
  <UPopover @update:open="onPickerToggle">
    <UButton
      :id="props.id"
      :label="label ?? t('dms.form.select_date')"
      :ui="{
        ...FIELD_TRIGGER_UI,
        label: label ? 'truncate text-highlighted' : 'truncate text-dimmed',
      }"
      v-bind="{
        ...buttonProps,
        'aria-invalid': invalid || undefined,
        ...ariaAttrs,
      }"
      variant="outline"
      color="neutral"
      icon="i-ph-calendar-blank"
      trailing-icon="i-ph-caret-down"
      block
      :class="[
        'justify-start',
        FIELD_TRIGGER_CLASS,
        invalid && FIELD_TRIGGER_INVALID_CLASS,
      ]"
    />

    <template #content>
      <UCalendar
        v-bind="forwarded"
        :min-value="minValue"
        :max-value="maxValue"
        :week-starts-on="props.weekStartsOn ?? weekStartsOn"
        class="p-2.5"
      />
    </template>
  </UPopover>
</template>
