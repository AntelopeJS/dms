import { computed, type Ref } from "vue";
import type { Composer } from "vue-i18n";
import type { UsePeriodReturn } from "#dms-core/app/composables/period/usePeriod";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodRange,
} from "#dms-core/app/composables/period/types";
import { readerClock } from "#dms-core/app/composables/period/periodClock";
import type { UsePeriodDraftReturn } from "../../build/composables/period/usePeriodDraft";
import {
  formatPeriodDays,
  formatPeriodRange,
  formatRelativeInstant,
  periodDuration,
} from "../../build/composables/period/periodDisplay";
import { PRESET_SHORT_LABELS } from "../../build/composables/period/periodShortLabels";
import type { resolveComparisonControl } from "../../build/composables/period/periodComparisonControl";
import type { usePageToolbar } from "../../build/composables/page-toolbar/pageToolbarContext";
import { toolbarControlHeightClass } from "../../build/composables/page-toolbar/toolbarControlHeight";

export const CALENDAR_ICON = "i-ph-calendar-blank-light";
export const CUSTOM_PRESET: PeriodPreset = "custom";
export const NO_COMPARISON: PeriodComparison = "none";

interface PresentationProps {
  presetLabels?: Partial<Record<PeriodPreset, string>>;
  comparisonLabels?: Partial<Record<PeriodComparison, string>>;
  rangeLabel?: "absolute" | "relative";
  maxDays?: number;
}

interface PeriodSelectorPresentationContext {
  props: PresentationProps;
  period: UsePeriodReturn;
  draft: UsePeriodDraftReturn;
  t: Composer["t"];
  locale: Ref<string>;
}

interface LayoutProps {
  align: "left" | "center" | "right";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant: "default" | "segmented";
}

type PeriodSelectorSize = NonNullable<LayoutProps["size"]>;
const DEFAULT_SIZE: PeriodSelectorSize = "sm";
const ALIGN_CLASSES = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const RANGE_LABEL_SIZE_CLASSES: Record<PeriodSelectorSize, string> = {
  xs: "text-[11px]",
  sm: "text-[11.5px]",
  md: "text-[12.5px]",
  lg: "text-[13px]",
  xl: "text-sm",
};

export function usePeriodSelectorLayout(
  props: LayoutProps,
  toolbar: ReturnType<typeof usePageToolbar>,
) {
  const size = computed<PeriodSelectorSize>(
    () => props.size ?? toolbar?.size.value ?? DEFAULT_SIZE,
  );
  const rangeLabelSizeClass = computed(
    () => RANGE_LABEL_SIZE_CLASSES[toolbar ? size.value : DEFAULT_SIZE],
  );
  const controlHeightClass = computed(() =>
    toolbar ? toolbarControlHeightClass(size.value) : "",
  );
  const alignClass = computed(() => ALIGN_CLASSES[props.align]);
  const isTrailing = computed(() => props.align === "right");
  const triggerOrder = computed(() =>
    isTrailing.value ? "order-3" : "order-1",
  );
  const rangeLabelOrder = computed(() =>
    isTrailing.value ? "order-1" : "order-3",
  );
  const isSegmented = computed(() => props.variant === "segmented");
  return {
    size,
    rangeLabelSizeClass,
    controlHeightClass,
    alignClass,
    triggerOrder,
    rangeLabelOrder,
    isSegmented,
  };
}

const ROLLING_PRESETS = new Set<PeriodPreset>([
  "last-hour",
  "last-24h",
  "today",
  "yesterday",
  "last-7-days",
  "last-30-days",
  "last-90-days",
]);
const PRESET_ITEM_CLASS =
  "focus-visible:outline-primary flex h-7 shrink-0 items-center gap-2 rounded-[6px] px-2 text-start text-[13px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2";
const PRESET_ACTIVE_CLASS = "text-primary bg-(--dms-accent-tint) font-semibold";
const PRESET_IDLE_CLASS =
  "text-toned hover:text-highlighted hover:bg-(--ui-bg-elevated)";

interface PresetEntry {
  preset: PeriodPreset;
  label: string;
  short?: string;
}

export function usePeriodSelectorPresets({
  props,
  period,
  draft,
  t,
}: PeriodSelectorPresentationContext) {
  function presetLabel(preset: PeriodPreset): string {
    return (
      props.presetLabels?.[preset] ?? t(`dms.period.presets.${preset}`, preset)
    );
  }
  function presetShortLabel(preset: PeriodPreset): string | undefined {
    const fallback = PRESET_SHORT_LABELS[preset];
    return fallback && t(`dms.period.short_presets.${preset}`, fallback);
  }
  function presetEntry(preset: PeriodPreset): PresetEntry {
    const label = presetLabel(preset);
    const short = presetShortLabel(preset);
    return { preset, label, short: short === label ? undefined : short };
  }
  const isCustomEnabled = computed(() =>
    period.presets.value.includes(CUSTOM_PRESET),
  );
  const listedPresets = computed(() =>
    period.presets.value.filter((preset) => preset !== CUSTOM_PRESET),
  );
  const presetGroups = computed<PresetEntry[][]>(() =>
    [
      listedPresets.value.filter((preset) => ROLLING_PRESETS.has(preset)),
      listedPresets.value.filter((preset) => !ROLLING_PRESETS.has(preset)),
    ]
      .filter((group) => group.length > 0)
      .map((group) => group.map(presetEntry)),
  );
  function presetItemClass(preset: PeriodPreset): string[] {
    return [
      PRESET_ITEM_CLASS,
      draft.preset.value === preset ? PRESET_ACTIVE_CLASS : PRESET_IDLE_CLASS,
    ];
  }
  const isCustomActive = computed(() => period.preset.value === CUSTOM_PRESET);
  return {
    presetLabel,
    presetShortLabel,
    isCustomEnabled,
    listedPresets,
    presetGroups,
    presetItemClass,
    isCustomActive,
  };
}

interface SegmentItem {
  label: string;
  ariaLabel: string;
  value: string;
  icon?: string;
}

export function usePeriodSelectorSegments(
  { props, period, locale }: PeriodSelectorPresentationContext,
  presets: ReturnType<typeof usePeriodSelectorPresets>,
  inToolbar: boolean,
) {
  const {
    presetLabel,
    presetShortLabel,
    listedPresets,
    isCustomEnabled,
    isCustomActive,
  } = presets;
  function segmentLabel(preset: PeriodPreset): string {
    return (
      props.presetLabels?.[preset] ??
      presetShortLabel(preset) ??
      presetLabel(preset)
    );
  }
  function customRangeText(): string | null {
    const { range } = period.state.value;
    return isCustomActive.value && range
      ? formatPeriodRange(range, locale.value, false)
      : null;
  }
  function customSegment(): SegmentItem {
    const range = customRangeText();
    const name = presetLabel(CUSTOM_PRESET);
    const visible = inToolbar ? "" : (range ?? name);
    return {
      label: visible,
      ariaLabel: range ? `${name}: ${range}` : name,
      value: CUSTOM_PRESET,
      icon: CALENDAR_ICON,
    };
  }
  return computed<SegmentItem[]>(() => {
    const items: SegmentItem[] = listedPresets.value.map((preset) => ({
      label: segmentLabel(preset),
      ariaLabel: presetLabel(preset),
      value: preset,
    }));
    if (isCustomEnabled.value) items.push(customSegment());
    return items;
  });
}

interface ButtonAppearance {
  variant: "subtle" | "outline";
  color: "primary" | "neutral";
}
const CUSTOM_TRIGGER: ButtonAppearance = {
  variant: "subtle",
  color: "primary",
};
const PRESET_TRIGGER: ButtonAppearance = {
  variant: "outline",
  color: "neutral",
};

export function usePeriodSelectorRangeLabels(
  { props, period, draft, t, locale }: PeriodSelectorPresentationContext,
  {
    presetLabel,
    isCustomActive,
    isCustomEnabled,
  }: ReturnType<typeof usePeriodSelectorPresets>,
) {
  const draftDurationLabel = computed(() => {
    const range = draft.range.value;
    if (!range) return presetLabel(draft.preset.value);
    const { unit, count } = periodDuration(range);
    return t(`dms.period.popover.${unit}`, { count }, count);
  });
  const maxDaysHint = computed(() =>
    props.maxDays && isCustomEnabled.value
      ? t(
          "dms.period.popover.max_days",
          { count: props.maxDays },
          props.maxDays,
        )
      : null,
  );
  const draftCompareLabel = computed(() => {
    const compare = draft.compareRange.value;
    return compare ? formatPeriodRange(compare, locale.value) : null;
  });
  const committedRangeLabel = computed(() => {
    const { range } = period.state.value;
    return range ? formatPeriodRange(range, locale.value) : null;
  });
  const relativeRangeLabel = computed<string | null>(() => {
    const { range } = period.state.value;
    if (props.rangeLabel !== "relative" || !range) return null;
    const now = period.resolvedAt.value;
    if (range.to.getTime() < now.getTime()) return null;
    const from = formatRelativeInstant(range.from, now, locale.value);
    return t("dms.period.since", { from }, `since ${from}`);
  });
  const rangeLabelText = computed(
    () => relativeRangeLabel.value ?? committedRangeLabel.value,
  );
  const triggerLabel = computed(() =>
    isCustomActive.value && committedRangeLabel.value
      ? committedRangeLabel.value
      : presetLabel(period.preset.value),
  );
  const triggerAppearance = computed<ButtonAppearance>(() =>
    isCustomActive.value ? CUSTOM_TRIGGER : PRESET_TRIGGER,
  );
  return {
    draftDurationLabel,
    maxDaysHint,
    draftCompareLabel,
    rangeLabelText,
    triggerLabel,
    triggerAppearance,
  };
}

const COMPARISON_KEY_ACTIVE =
  "bg-[repeating-linear-gradient(90deg,var(--dms-chart-2)_0_4px,transparent_4px_7px)]";
const COMPARISON_KEY_NONE = "bg-(--ui-border-accented)";

export function comparisonKeyClass(active: boolean): string {
  return active ? COMPARISON_KEY_ACTIVE : COMPARISON_KEY_NONE;
}

function isSameYear(compare: PeriodRange, main: PeriodRange): boolean {
  const clock = readerClock();
  return clock.wall(compare.to).year === clock.wall(main.to).year;
}

export function usePeriodSelectorComparison(
  { props, period, draft, t, locale }: PeriodSelectorPresentationContext,
  comparisonSetup: ReturnType<typeof resolveComparisonControl>,
) {
  function comparisonLabel(comparison: PeriodComparison): string {
    return (
      props.comparisonLabels?.[comparison] ??
      t(`dms.period.comparisons.${comparison}`, comparison)
    );
  }
  function compareOptionLabel(comparison: PeriodComparison): string {
    return (
      props.comparisonLabels?.[comparison] ??
      t(`dms.period.compare_options.${comparison}`, comparison)
    );
  }
  const compareSelectItems = computed(() =>
    period.comparisons.value.map((comparison) => ({
      label: compareOptionLabel(comparison),
      value: comparison,
    })),
  );
  const draftComparison = computed<PeriodComparison>({
    get: () => draft.comparison.value,
    set: (value) => draft.selectComparison(value),
  });
  const canCompare = computed(() =>
    period.comparisons.value.some((comparison) => comparison !== NO_COMPARISON),
  );
  const isComparisonMenu = computed(
    () => canCompare.value && comparisonSetup.control === "menu",
  );
  const toggledComparison = comparisonSetup.toggled;
  const canChooseComparison = computed(
    () => canCompare.value && comparisonSetup.control !== "hidden",
  );
  const isComparisonDisabled = computed(() => !period.state.value.range);
  function toggleComparison() {
    if (!toggledComparison) return;
    period.setComparison(
      hasComparison.value ? NO_COMPARISON : toggledComparison,
    );
  }
  const comparisonItems = computed(() => [
    period.comparisons.value.map((comparison) => ({
      label: comparisonLabel(comparison),
      onSelect: () => period.setComparison(comparison),
    })),
  ]);
  const hasComparison = computed(
    () => period.comparison.value !== NO_COMPARISON,
  );
  function compareRangeText(compare: PeriodRange, main: PeriodRange): string {
    return formatPeriodRange(compare, locale.value, !isSameYear(compare, main));
  }
  const compareRangeLabel = computed(() => {
    const { compareRange, range } = period.state.value;
    return compareRange && range ? compareRangeText(compareRange, range) : null;
  });
  const rangeLabelCompare = computed(() =>
    isComparisonMenu.value ? null : compareRangeLabel.value,
  );
  const menuCompareDays = computed(() => {
    const { compareRange, range } = period.state.value;
    if (!compareRange || !range) return null;
    return formatPeriodDays(
      compareRange,
      locale.value,
      !isSameYear(compareRange, range),
    );
  });
  const comparisonMenuLabel = computed(() => {
    const days = menuCompareDays.value;
    if (!hasComparison.value || !days)
      return comparisonLabel(period.comparison.value);
    return `${t("dms.period.popover.vs", "vs")} ${days}`;
  });
  const comparisonMenuAria = computed(() => {
    const name = `${t("dms.period.comparison_aria", "Comparison")}: ${comparisonLabel(period.comparison.value)}`;
    const days = hasComparison.value ? menuCompareDays.value : null;
    return days ? `${name}, ${days}` : name;
  });
  return {
    comparisonLabel,
    compareSelectItems,
    draftComparison,
    isComparisonMenu,
    toggledComparison,
    canChooseComparison,
    isComparisonDisabled,
    toggleComparison,
    comparisonItems,
    hasComparison,
    rangeLabelCompare,
    comparisonMenuLabel,
    comparisonMenuAria,
  };
}
