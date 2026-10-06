import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { UsePeriodReturn } from "#dms-core/app/composables/period/usePeriod";
import { resolvePresetRange } from "#dms-core/app/composables/period/presetResolvers";
import { resolveComparisonRange } from "#dms-core/app/composables/period/compareResolvers";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodRange,
} from "#dms-core/app/composables/period/types";
import { calendarToRange, rangeToCalendar } from "./periodDisplay";

const CUSTOM_PRESET: PeriodPreset = "custom";

export interface UsePeriodDraftReturn {
  preset: Ref<PeriodPreset>;
  comparison: Ref<PeriodComparison>;
  customRange: Ref<PeriodRange | null>;
  /** The range the staged preset (or custom range) resolves to. */
  range: ComputedRef<PeriodRange>;
  compareRange: ComputedRef<PeriodRange | null>;
  isDirty: ComputedRef<boolean>;
  /** Start over from the committed period (on open, on cancel). */
  reset: () => void;
  selectPreset: (preset: PeriodPreset) => void;
  selectRange: (range: PeriodRange) => void;
  selectComparison: (comparison: PeriodComparison) => void;
  /** Commit the staged selection to the period, in one state change. */
  apply: () => void;
}

function sameInstant(a: Date | undefined, b: Date | undefined): boolean {
  return a?.getTime() === b?.getTime();
}

function sameRange(a: PeriodRange | null, b: PeriodRange | null): boolean {
  if (!a || !b) return a === b;
  return sameInstant(a.from, b.from) && sameInstant(a.to, b.to);
}

/**
 * Staged copy of a period for the selector popover: presets, dates and the
 * comparison change here, and the period (with every chart bound to its
 * scope) only moves on `apply`.
 */
export function usePeriodDraft(period: UsePeriodReturn): UsePeriodDraftReturn {
  const preset = ref<PeriodPreset>(period.preset.value);
  const comparison = ref<PeriodComparison>(period.comparison.value);
  const customRange = ref<PeriodRange | null>(null);

  function committedCustomRange(): PeriodRange | null {
    return period.preset.value === CUSTOM_PRESET
      ? period.state.value.range
      : null;
  }

  function reset(): void {
    preset.value = period.preset.value;
    comparison.value = period.comparison.value;
    customRange.value = committedCustomRange();
  }

  const range = computed<PeriodRange>(() =>
    resolvePresetRange(
      preset.value,
      new Date(),
      customRange.value ?? period.state.value.range,
    ),
  );

  const compareRange = computed<PeriodRange | null>(() =>
    resolveComparisonRange(
      comparison.value,
      range.value,
      period.customCompareRange.value,
    ),
  );

  const isDirty = computed(
    () =>
      preset.value !== period.preset.value ||
      comparison.value !== period.comparison.value ||
      (preset.value === CUSTOM_PRESET &&
        !sameRange(customRange.value, committedCustomRange())),
  );

  function selectPreset(next: PeriodPreset): void {
    if (next === CUSTOM_PRESET && !customRange.value) {
      // Custom starts from the days on screen, ready to be adjusted.
      customRange.value = calendarToRange(rangeToCalendar(range.value));
    }
    preset.value = next;
  }

  function selectRange(next: PeriodRange): void {
    customRange.value = next;
    preset.value = CUSTOM_PRESET;
  }

  function selectComparison(next: PeriodComparison): void {
    comparison.value = next;
  }

  function apply(): void {
    if (preset.value === CUSTOM_PRESET && customRange.value) {
      period.setCustomRange(customRange.value);
    } else {
      period.setPreset(preset.value);
    }
    period.setComparison(comparison.value);
  }

  reset();

  return {
    preset,
    comparison,
    customRange,
    range,
    compareRange,
    isDirty,
    reset,
    selectPreset,
    selectRange,
    selectComparison,
    apply,
  };
}
