<script setup lang="ts" generic="R extends boolean, M extends boolean">
import { formatDate } from "#dms-core/app/utils/formatter";
import { isObject, isString } from "#dms-core/app/utils/type-check";
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
import { useControlError } from "../../../composables/form/useControlError";
import {
  FIELD_TRIGGER_CLASS,
  FIELD_TRIGGER_INVALID_CLASS,
  FIELD_TRIGGER_UI,
} from "../../../build/utils/fieldTrigger";

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
  if (props.range && Array.isArray(value)) {
    const rangeValue = { start: value[0], end: value[1] };
    return {
      start: convertToCalendarDate(rangeValue.start),
      end: convertToCalendarDate(rangeValue.end),
    };
  }
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
  emitFormBlur,
  emitFormChange,
} = useFormField<DatePickerProps>(props);
const invalid = computed(() => fieldColor.value === "error");

const RANGE_INCOMPLETE = "$dms.field_errors.range_incomplete";
const { report } = useControlError();
let isHalfPicked = false;

/** Follows a range being picked: its start alone, then both ends. */
function trackRangePick(value: Parameters<typeof forwardEmit>[1]): void {
  if (value === null || value === undefined) {
    isHalfPicked = false;
    report(undefined);
    return;
  }
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The forwarded event has no validated range owner; keep optional property reads on arbitrary non-null values rather than adding validation.
  const ends = value as Partial<StrictDateRange>;
  if (!ends.start) return;
  isHalfPicked = !ends.end;
  if (!isHalfPicked) report(undefined);
}

const isPickerOpen = ref(false);

/**
 * Whether a pick completes the field: a day, or a range's end. A multiple
 * picker stays open for the next day, a range for its end.
 */
function isPickComplete(value: Parameters<typeof forwardEmit>[1]): boolean {
  if (!value || props.multiple) return false;
  if (!props.range) return true;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The forwarded event has no validated range owner; keep its existing optional-property truthiness checks on arbitrary values.
  const ends = value as Partial<StrictDateRange>;
  return !!ends.start && !!ends.end;
}

function onPickerToggle(open: boolean): void {
  isPickerOpen.value = open;
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
  } = props;
  return {
    ...calendarProps,
    color: color === "error" ? undefined : color,
    modelValue: convertModelValue(modelValue.value),
  };
});

const minValue = computed(() => props.minValue ?? toBoundDate(props.minDate));
const maxValue = computed(() => props.maxValue ?? toBoundDate(props.maxDate));

type EmitEvent = string;
type EmitValue = Parameters<typeof isObject>[0];

const wrappedEmits = (event: EmitEvent, value: EmitValue) => {
  forwardEmit(event, value);
  if (event === "update:modelValue" && props.range) trackRangePick(value);

  if (event === "update:modelValue") emitFormChange();

  if (event === "update:modelValue" && isPickComplete(value)) {
    onPickerToggle(false);
  }
};

function forwardEmit(event: EmitEvent, value: EmitValue): void {
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
    // SAFETY: Vue emit forwards event names and payloads at runtime, including the placeholder and start-value events not serialized above.
    const forwardEvent = emits as (event: string, ...args: unknown[]) => void;
    forwardEvent(event, value);
  }
}

const forwarded = useForwardPropsEmits(convertedProps, wrappedEmits);
const buttonProps = reactivePick(props, "disabled");

function formatDateLabel(
  value: Parameters<typeof formatDate>[0],
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const date = value instanceof Date ? value : String(value);
  return formatDate(date, locale.value, DATE_LABEL_FORMAT) ?? undefined;
}

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
  <UPopover :open="isPickerOpen" @update:open="onPickerToggle">
    <UButton
      :id="props.id"
      :label="label ?? t('dms.form.select_date')"
      :title="label"
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
