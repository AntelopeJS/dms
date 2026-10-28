import { computed, type ComputedRef } from "vue";
import { usePeriodScopeComparison } from "#dms-core/app/composables/period/usePeriodScope";
import type { PeriodComparison } from "#dms-core/app/composables/period/types";

const COMPARE_LABEL_KEY_PREFIX = "dms.period.compare_labels";
const COMPARE_LEGEND_KEY_PREFIX = "dms.period.compare_options";

const NAMED_LEGEND_COMPARISONS: PeriodComparison[] = [
  "previous-period",
  "previous-year",
];

export interface PeriodComparisonDisplay {
  /**
   * The scope compares against nothing: the user picked "no comparison", or
   * the period (every period, `all`) has no window to compare against. A
   * card hides its change, its comparison value and its label. `false` while
   * the card has no scope, or its scope is not registered yet: the card then
   * shows what its data carries.
   */
  isOff: ComputedRef<boolean>;
  /** "vs previous year", following the scope; `null` without one. */
  label: ComputedRef<string | null>;
  /** "Previous year", a chart legend's name for the comparison series. */
  legendLabel: ComputedRef<string | null>;
}

/**
 * What a period-bound card shows of its comparison, following the
 * comparison selected on the scope's `PeriodSelector`.
 */
export function usePeriodComparisonDisplay(
  periodScope: string | undefined,
): PeriodComparisonDisplay {
  const { t } = useI18n();
  const comparison = usePeriodScopeComparison(periodScope);
  const activeComparison = computed(() =>
    comparison.value && comparison.value !== "none" ? comparison.value : null,
  );
  return {
    isOff: computed(() => comparison.value === "none"),
    label: computed(() => {
      const active = activeComparison.value;
      return active ? t(`${COMPARE_LABEL_KEY_PREFIX}.${active}`, active) : null;
    }),
    legendLabel: computed(() => {
      const active = activeComparison.value;
      if (!active || !NAMED_LEGEND_COMPARISONS.includes(active)) return null;
      return t(`${COMPARE_LEGEND_KEY_PREFIX}.${active}`, active);
    }),
  };
}
