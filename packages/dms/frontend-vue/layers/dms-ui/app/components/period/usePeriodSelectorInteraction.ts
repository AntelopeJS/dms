import { computed, ref, type Ref } from "vue";
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
  calendarToRange,
  limitCalendarRange,
  rangeToCalendar,
} from "../../build/composables/period/periodDisplay";
import { CUSTOM_PRESET } from "./periodSelectorPresentation";

export function usePeriodSelectorInteraction(
  props: { maxDays?: number },
  period: UsePeriodReturn,
  draft: UsePeriodDraftReturn,
  isCustomEnabled: Ref<boolean>,
) {
  const isOpen = ref(false);
  const pendingStart = ref<CalendarDate | null>(null);
  function setOpen(open: boolean) {
    if (open) draft.reset();
    pendingStart.value = null;
    isOpen.value = open;
  }
  function selectDraftPreset(preset: PeriodPreset) {
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
    draft.apply();
    isOpen.value = false;
  }
  const draftCalendar = computed<CalendarRange>(() =>
    rangeToCalendar(draft.range.value ?? startingRange(new Date())),
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
    draft.selectRange(
      calendarToRange(limitCalendarRange(range, props.maxDays, anchor)),
    );
  }
  function updateStart(value: DateValue | null | undefined) {
    if (!value) return;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- UInputDate emits DateValue, not only CalendarDate; preserve unchecked forwarding rather than reject or convert other date variants.
    const start = value as CalendarDate;
    const end = draftCalendar.value.end;
    selectCalendarRange(
      start.compare(end) > 0 ? { start, end: start } : { start, end },
    );
  }
  function updateEnd(value: DateValue | null | undefined) {
    if (!value) return;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- UInputDate emits DateValue, not only CalendarDate; preserve unchecked forwarding rather than reject or convert other date variants.
    const end = value as CalendarDate;
    const start = draftCalendar.value.start;
    selectCalendarRange(
      end.compare(start) < 0 ? { start: end, end } : { start, end },
      "end",
    );
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
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- MouseEvent.target does not guarantee closest; retain optional null access and the existing throw for non-element targets instead of adding a guard.
    const segment = (event.target as HTMLElement | null)?.closest(
      "[role='radio']",
    );
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
    updateStart,
    updateEnd,
    segmentedPreset,
    onSegmentedClick,
  };
}
