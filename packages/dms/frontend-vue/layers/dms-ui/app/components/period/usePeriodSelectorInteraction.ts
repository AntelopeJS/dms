import { computed, ref, shallowRef, type Ref } from "vue";
import type { CalendarDate, DateValue } from "@internationalized/date";
import type { UsePeriodReturn } from "#dms-core/app/composables/period/usePeriod";
import type { PeriodPreset } from "#dms-core/app/composables/period/types";
import {
  startingRange,
  type UsePeriodDraftReturn,
} from "../../build/composables/period/usePeriodDraft";
import {
  type CalendarRange,
  type CalendarRangeAnchor,
  calendarRangeDays,
  calendarToRange,
  limitCalendarRange,
  rangeToCalendar,
} from "../../build/composables/period/periodDisplay";
import { toCalendarDay } from "../../build/utils/calendarDay";
import { CUSTOM_PRESET } from "./periodSelectorPresentation";

interface HeldDay {
  anchor: CalendarRangeAnchor;
  day: CalendarDate;
}

function withHeldDay(
  range: CalendarRange,
  held: HeldDay | null,
): CalendarRange {
  return held ? { ...range, [held.anchor]: held.day } : range;
}

function isLeavingField(event: FocusEvent): boolean {
  const field = event.currentTarget;
  const next = event.relatedTarget;
  return !(
    field instanceof Node &&
    next instanceof Node &&
    field.contains(next)
  );
}

export function usePeriodSelectorInteraction(
  props: { maxDays?: number },
  period: UsePeriodReturn,
  draft: UsePeriodDraftReturn,
  isCustomEnabled: Ref<boolean>,
) {
  const isOpen = ref(false);
  const pendingStart = ref<CalendarDate | null>(null);
  const heldDay = shallowRef<HeldDay | null>(null);
  function setOpen(open: boolean) {
    if (open) draft.reset();
    pendingStart.value = null;
    heldDay.value = null;
    isOpen.value = open;
  }
  function selectDraftPreset(preset: PeriodPreset) {
    heldDay.value = null;
    draft.selectPreset(preset);
    const custom = draft.customRange.value;
    if (preset !== CUSTOM_PRESET || !custom) return;
    selectCalendarRange(rangeToCalendar(custom), "end");
  }
  function openCustom() {
    draft.reset();
    selectDraftPreset(CUSTOM_PRESET);
    pendingStart.value = null;
    isOpen.value = true;
  }
  function applyDraft() {
    commitHeldDay();
    draft.apply();
    isOpen.value = false;
  }
  const draftCalendar = computed<CalendarRange>(() =>
    rangeToCalendar(draft.range.value ?? startingRange(new Date())),
  );
  const fieldCalendar = computed(() =>
    withHeldDay(draftCalendar.value, heldDay.value),
  );
  const draftCompareCalendar = computed<CalendarRange | null>(() => {
    const compare = draft.compareRange.value;
    return compare ? rangeToCalendar(compare) : null;
  });
  function selectCalendarRange(
    range: CalendarRange,
    anchor: CalendarRangeAnchor = "start",
  ) {
    if (!isCustomEnabled.value) return;
    heldDay.value = null;
    draft.selectRange(
      calendarToRange(limitCalendarRange(range, props.maxDays, anchor)),
    );
  }
  function typeDay(
    anchor: CalendarRangeAnchor,
    value: DateValue | null | undefined,
  ) {
    const day = toCalendarDay(value);
    if (!day || !isCustomEnabled.value) return;
    const range = { ...draftCalendar.value, [anchor]: day };
    const fits =
      range.start.compare(range.end) <= 0 &&
      (!props.maxDays || calendarRangeDays(range) <= props.maxDays);
    if (fits) {
      selectCalendarRange(range, anchor);
      return;
    }
    heldDay.value = { anchor, day };
    draft.selectPreset(CUSTOM_PRESET);
  }
  function commitHeldDay() {
    const held = heldDay.value;
    if (!held) return;
    const range = fieldCalendar.value;
    selectCalendarRange(
      range.start.compare(range.end) <= 0
        ? range
        : { start: held.day, end: held.day },
      held.anchor,
    );
  }
  function leaveField(event: FocusEvent) {
    if (isLeavingField(event)) commitHeldDay();
  }
  const segmentedPreset = computed<string | number | undefined>({
    get: () => period.preset.value,
    set: (value) => {
      const preset = period.presets.value.find((entry) => entry === value);
      if (!preset) return;
      if (preset === CUSTOM_PRESET) openCustom();
      else period.setPreset(preset);
    },
  });
  function onSegmentedClick(event: MouseEvent) {
    if (period.preset.value !== CUSTOM_PRESET) return;
    const segment =
      event.target instanceof Element
        ? event.target.closest("[role='radio']")
        : null;
    if (segment?.getAttribute("aria-checked") === "true") openCustom();
  }
  return {
    isOpen,
    pendingStart,
    setOpen,
    selectDraftPreset,
    applyDraft,
    draftCalendar,
    draftCompareCalendar,
    selectCalendarRange,
    fieldCalendar,
    typeDay,
    leaveField,
    segmentedPreset,
    onSegmentedClick,
  };
}
