<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import {
  type CalendarDate,
  type DateValue,
  getLocalTimeZone,
  isSameMonth,
  today,
} from "@internationalized/date";
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
  type DateRange,
} from "reka-ui";
import type { CalendarRange } from "../../composables/period/periodDisplay";

// Two-month range calendar of the period selector (design .cal): a
// continuous accent strip for the selected range with filled endpoints, and
// the comparison range painted under it as a violet strip with ringed ends.
interface Props {
  modelValue: CalendarRange | null;
  compareRange?: CalendarRange | null;
  locale: string;
  weekStartsOn?: number;
  numberOfMonths?: number;
  readonly?: boolean;
}

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const props = withDefaults(defineProps<Props>(), {
  compareRange: null,
  weekStartsOn: 1,
  numberOfMonths: 2,
  readonly: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: CalendarRange];
  /** A start day is picked and the end is still to come. */
  pending: [start: CalendarDate | null];
}>();

const DAYS_PER_WEEK = 7;
const LAST_COLUMN = DAYS_PER_WEEK - 1;
const WEEKDAY_LABEL_LENGTH = 2;

const todayDate = today(getLocalTimeZone());

// Day being picked: the first click of a new range, until the second lands.
// shallowRef: a deep ref would unwrap the date classes (losing their private
// fields) and break their types.
const pendingStart = shallowRef<CalendarDate | null>(null);

// The range's last month sits on the right, the month before it on its
// left: a trailing range reads against what came just before.
function firstVisibleMonth(range: CalendarRange | null): CalendarDate {
  const anchor = (range?.end ?? todayDate).set({ day: 1 });
  return anchor.subtract({ months: props.numberOfMonths - 1 });
}

const placeholder = shallowRef<DateValue>(firstVisibleMonth(props.modelValue));

// The view follows the range when it changes from outside (a preset, the
// date fields), not while the reader pages through months.
watch(
  () => props.modelValue,
  (range) => {
    pendingStart.value = null;
    if (!range) return;
    const visibleStart = placeholder.value.set({ day: 1 });
    const visibleEnd = visibleStart.add({ months: props.numberOfMonths });
    const visible =
      range.start.compare(visibleStart) >= 0 &&
      range.end.compare(visibleEnd) < 0;
    if (!visible) placeholder.value = firstVisibleMonth(range);
  },
);

const rekaValue = computed<DateRange>(() =>
  pendingStart.value
    ? { start: pendingStart.value, end: undefined }
    : {
        start: props.modelValue?.start,
        end: props.modelValue?.end,
      },
);

function onUpdate(value: DateRange | null) {
  const start = value?.start as CalendarDate | undefined;
  const end = value?.end as CalendarDate | undefined;
  if (start && end) {
    pendingStart.value = null;
    emit("pending", null);
    emit("update:modelValue", { start, end });
    return;
  }
  pendingStart.value = start ?? null;
  emit("pending", pendingStart.value);
}

function onPlaceholder(value: DateValue) {
  // Picking a start day re-anchors reka's view on it; with two months on
  // screen that would shift the grid under the pointer.
  if (pendingStart.value && isSameMonth(value, pendingStart.value)) return;
  placeholder.value = value;
}

const monthFormatter = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, { month: "long", year: "numeric" }),
);

function monthTitle(month: DateValue): string {
  return monthFormatter.value.format(month.toDate(getLocalTimeZone()));
}

function weekdayLabel(day: string): string {
  return day.replace(".", "").slice(0, WEEKDAY_LABEL_LENGTH);
}

function within(date: DateValue, range: CalendarRange | null): boolean {
  if (!range) return false;
  return date.compare(range.start) >= 0 && date.compare(range.end) <= 0;
}

function isSameDay(a: DateValue, b: DateValue | undefined): boolean {
  return !!b && a.compare(b) === 0;
}

const selection = computed<CalendarRange | null>(() =>
  pendingStart.value
    ? { start: pendingStart.value, end: pendingStart.value }
    : props.modelValue,
);

const STRIP_RADIUS_START = "rounded-s-lg";
const STRIP_RADIUS_END = "rounded-e-lg";

// The strip lives on the cell: accent for the range, violet for the
// comparison, rounded where it starts or breaks (row ends, month ends).
function cellClass(
  date: DateValue,
  month: DateValue,
  column: number,
): (string | false)[] {
  if (!isSameMonth(date, month)) return ["invisible"];
  const range = selection.value;
  const compare = props.compareRange;
  const inRange = within(date, range);
  const inCompare = within(date, compare);
  const isLastOfMonth = date.add({ days: 1 }).month !== date.month;
  const opensStrip =
    column === 0 ||
    date.day === 1 ||
    isSameDay(date, range?.start) ||
    isSameDay(date, compare?.start);
  const closesStrip =
    column === LAST_COLUMN ||
    isLastOfMonth ||
    isSameDay(date, range?.end) ||
    isSameDay(date, compare?.end);
  const isSingleDay = !!range && isSameDay(range.start, range.end);
  return [
    inRange && !isSingleDay && "bg-(--dms-accent-tint)",
    inCompare && "bg-secondary/10",
    opensStrip && STRIP_RADIUS_START,
    closesStrip && STRIP_RADIUS_END,
  ];
}

function triggerClass(date: DateValue): (string | false)[] {
  const range = selection.value;
  const compare = props.compareRange;
  const isEndpoint =
    isSameDay(date, range?.start) || isSameDay(date, range?.end);
  const isCompareEdge =
    !isEndpoint &&
    (isSameDay(date, compare?.start) || isSameDay(date, compare?.end));
  return [
    isEndpoint &&
      "bg-(--dms-accent-fill) text-(--dms-accent-on-fill) font-bold shadow-(--dms-fill-highlight)",
    isCompareEdge &&
      "text-secondary font-[650] ring ring-inset ring-secondary/40",
    !isEndpoint && (within(date, range) ? "text-highlighted" : "text-toned"),
    !isEndpoint &&
      !props.readonly &&
      "cursor-pointer hover:bg-(--ui-bg-elevated) data-disabled:cursor-default data-disabled:hover:bg-transparent",
  ];
}

const weekStart = computed(() => props.weekStartsOn as WeekStart);
</script>

<template>
  <RangeCalendarRoot
    v-slot="{ grid, weekDays }"
    :model-value="rekaValue"
    :placeholder="placeholder"
    :locale="locale"
    :week-starts-on="weekStart"
    :number-of-months="numberOfMonths"
    :max-value="todayDate"
    :readonly="readonly"
    weekday-format="short"
    prevent-deselect
    class="flex gap-6"
    @update:model-value="onUpdate"
    @update:placeholder="onPlaceholder"
  >
    <div
      v-for="(month, index) in grid"
      :key="month.value.toString()"
      class="w-56 shrink-0"
    >
      <div class="mb-1.5 flex h-7 items-center">
        <RangeCalendarPrev v-if="index === 0" as-child>
          <UButton
            icon="i-ph-caret-left-light"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            class="w-[26px] justify-center"
            :aria-label="
              $t('dms.period.popover.previous_month', 'Previous month')
            "
          />
        </RangeCalendarPrev>
        <span v-else class="w-[26px]" aria-hidden="true" />
        <span
          class="text-highlighted flex-1 text-center text-[13px] font-semibold first-letter:uppercase"
        >
          {{ monthTitle(month.value) }}
        </span>
        <RangeCalendarNext v-if="index === grid.length - 1" as-child>
          <UButton
            icon="i-ph-caret-right-light"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            class="w-[26px] justify-center"
            :aria-label="$t('dms.period.popover.next_month', 'Next month')"
          />
        </RangeCalendarNext>
        <span v-else class="w-[26px]" aria-hidden="true" />
      </div>
      <RangeCalendarGrid class="w-full border-collapse select-none">
        <RangeCalendarGridHead>
          <RangeCalendarGridRow class="grid grid-cols-7">
            <RangeCalendarHeadCell
              v-for="day in weekDays"
              :key="day"
              class="text-dimmed grid h-6 place-items-center font-mono text-[10px] font-semibold tracking-[0.06em] uppercase"
            >
              {{ weekdayLabel(day) }}
            </RangeCalendarHeadCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridHead>
        <RangeCalendarGridBody class="grid gap-y-0.5">
          <RangeCalendarGridRow
            v-for="(row, rowIndex) in month.rows"
            :key="`row-${rowIndex}`"
            class="grid grid-cols-7"
          >
            <RangeCalendarCell
              v-for="(date, column) in row"
              :key="date.toString()"
              :date="date"
              class="grid h-8 place-items-center p-0"
              :class="cellClass(date, month.value, column)"
            >
              <RangeCalendarCellTrigger
                :day="date"
                :month="month.value"
                class="focus-visible:outline-primary relative grid size-[30px] place-items-center rounded-lg font-mono text-[12.5px] font-medium tabular-nums outline-offset-1 transition-colors focus-visible:outline-2 data-disabled:opacity-55 data-highlighted:bg-(--dms-accent-tint) data-today:after:absolute data-today:after:bottom-[3px] data-today:after:size-[3px] data-today:after:rounded-full data-today:after:bg-current"
                :class="triggerClass(date)"
              />
            </RangeCalendarCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridBody>
      </RangeCalendarGrid>
    </div>
  </RangeCalendarRoot>
</template>
