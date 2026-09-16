<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  type CalendarDate,
  fromDate,
  getLocalTimeZone,
  toCalendarDate,
} from "@internationalized/date";
import type { DateRange } from "reka-ui";
import { registerPeriodScope } from "#dms-core/app/composables/period/usePeriodScope";
import { usePeriod } from "#dms-core/app/composables/period/usePeriod";
import {
  END_OF_DAY_HOURS,
  END_OF_DAY_MINUTES,
  END_OF_DAY_MS,
  END_OF_DAY_SECONDS,
} from "#dms-core/app/composables/period/types";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodRange,
} from "#dms-core/app/composables/period/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  id: string;
  defaultPreset?: PeriodPreset;
  defaultComparison?: PeriodComparison;
  presets?: PeriodPreset[];
  comparisons?: PeriodComparison[];
  presetLabels?: Partial<Record<PeriodPreset, string>>;
  comparisonLabels?: Partial<Record<PeriodComparison, string>>;
  align?: "left" | "center" | "right";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showRangeLabel?: boolean;
  variant?: "default" | "segmented";
}

const PRESET_ICON = "i-lucide-calendar-days";
const COMPARISON_ICON = "i-lucide-git-compare";
const CUSTOM_ICON = "i-lucide-calendar";
const CHEVRON_ICON = "i-lucide-chevron-down";
const RANGE_SEPARATOR = "·";
const DATE_RANGE_DASH = "–";
const CUSTOM_PRESET: PeriodPreset = "custom";
const SEGMENTED_VARIANT: NonNullable<Props["variant"]> = "segmented";

const props = withDefaults(defineProps<Props>(), {
  align: "right",
  size: "sm",
  showRangeLabel: true,
  variant: "default",
});

const ALIGN_CLASSES: Record<NonNullable<Props["align"]>, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

useComponentEvent(props.componentId);
useWatch(props.watchActions || [], props.componentId);

const { t, locale } = useI18n();

const period = usePeriod({
  defaultPreset: props.defaultPreset,
  defaultComparison: props.defaultComparison,
  presets: props.presets,
  comparisons: props.comparisons,
});

const cleanup = registerPeriodScope(props.id, period.state);
onBeforeUnmount(cleanup);

const alignClass = computed(() => ALIGN_CLASSES[props.align]);

function presetLabel(preset: PeriodPreset): string {
  return (
    props.presetLabels?.[preset] ?? t(`dms.period.presets.${preset}`, preset)
  );
}

function comparisonLabel(comparison: PeriodComparison): string {
  return (
    props.comparisonLabels?.[comparison] ??
    t(`dms.period.comparisons.${comparison}`, comparison)
  );
}

const visiblePresets = computed(() =>
  period.presets.value.filter((preset) => preset !== CUSTOM_PRESET),
);

const isCustomEnabled = computed(() =>
  period.presets.value.includes(CUSTOM_PRESET),
);

interface LabelledPreset {
  preset: PeriodPreset;
  label: string;
}

const labelledPresets = computed<LabelledPreset[]>(() =>
  visiblePresets.value.map((preset) => ({
    preset,
    label: presetLabel(preset),
  })),
);

const presetItems = computed(() => [
  labelledPresets.value.map(({ preset, label }) => ({
    label,
    onSelect: () => period.setPreset(preset),
  })),
]);

const isSegmented = computed(() => props.variant === SEGMENTED_VARIANT);

const isCustomPopoverOpen = ref(false);

const segmentedItems = computed(() => {
  const items = labelledPresets.value.map(({ preset, label }) => ({
    label,
    value: preset,
  }));
  if (isCustomEnabled.value) {
    items.push({ label: presetLabel(CUSTOM_PRESET), value: CUSTOM_PRESET });
  }
  return items;
});

const segmentedPreset = computed<string | number | undefined>({
  get: () => period.preset.value,
  set: (value) => {
    const preset = period.presets.value.find((entry) => entry === value);
    if (!preset) return;
    period.setPreset(preset);
    if (preset === CUSTOM_PRESET) isCustomPopoverOpen.value = true;
  },
});

const comparisonItems = computed(() => [
  period.comparisons.value.map((comparison) => ({
    label: comparisonLabel(comparison),
    onSelect: () => period.setComparison(comparison),
  })),
]);

const presetButtonLabel = computed(() => presetLabel(period.preset.value));
const comparisonButtonLabel = computed(() =>
  comparisonLabel(period.comparison.value),
);

const canCompare = computed(() =>
  period.comparisons.value.some((comparison) => comparison !== "none"),
);

function dateToCalendar(date: Date): CalendarDate {
  return toCalendarDate(fromDate(date, getLocalTimeZone()));
}

function calendarToDate(calendar: CalendarDate, asEndOfDay: boolean): Date {
  const native = new Date(calendar.year, calendar.month - 1, calendar.day);
  if (asEndOfDay) {
    native.setHours(
      END_OF_DAY_HOURS,
      END_OF_DAY_MINUTES,
      END_OF_DAY_SECONDS,
      END_OF_DAY_MS,
    );
  }
  return native;
}

const customCalendarValue = ref<DateRange | null>(null);

watch(
  () => period.state.value.range,
  (range) => {
    if (period.preset.value === CUSTOM_PRESET) {
      customCalendarValue.value = {
        start: dateToCalendar(range.from),
        end: dateToCalendar(range.to),
      };
    }
  },
  { immediate: true },
);

function applyCustomRange(value: unknown) {
  if (!value || typeof value !== "object") return;
  const rangeValue = value as { start?: CalendarDate; end?: CalendarDate };
  if (!rangeValue.start || !rangeValue.end) return;
  const range: PeriodRange = {
    from: calendarToDate(rangeValue.start, false),
    to: calendarToDate(rangeValue.end, true),
  };
  period.setCustomRange(range);
}

function formatShortRange(range: PeriodRange): string {
  const formatter = new Intl.DateTimeFormat(locale.value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(range.from)} ${DATE_RANGE_DASH} ${formatter.format(range.to)}`;
}

const customLabel = computed(() => formatShortRange(period.state.value.range));

const isCustomActive = computed(() => period.preset.value === CUSTOM_PRESET);

interface ButtonAppearance {
  variant: "subtle" | "ghost";
  color: "primary" | "neutral";
}

const ACTIVE_CUSTOM_APPEARANCE: ButtonAppearance = {
  variant: "subtle",
  color: "primary",
};
const IDLE_CUSTOM_APPEARANCE: ButtonAppearance = {
  variant: "ghost",
  color: "neutral",
};

const customButtonAppearance = computed<ButtonAppearance>(() =>
  isCustomActive.value ? ACTIVE_CUSTOM_APPEARANCE : IDLE_CUSTOM_APPEARANCE,
);

const rangeDisplay = computed(() => {
  const main = formatShortRange(period.state.value.range);
  const compare = period.state.value.compareRange;
  if (!compare) return main;
  return `${main} ${RANGE_SEPARATOR} vs ${formatShortRange(compare)}`;
});
</script>

<template>
  <div
    class="dms-period-selector flex flex-wrap items-center gap-2"
    :class="alignClass"
    role="group"
    :aria-label="$t('dms.period.aria_label', 'Period selector')"
  >
    <DmsSegmented
      v-if="isSegmented"
      v-model="segmentedPreset"
      :items="segmentedItems"
      :size="size"
      :aria-label="$t('dms.period.preset_aria', 'Preset')"
    />

    <UDropdownMenu v-else :items="presetItems" :content="{ align: 'end' }">
      <UButton
        variant="outline"
        color="neutral"
        :size="size"
        :icon="PRESET_ICON"
        :trailing-icon="CHEVRON_ICON"
        :aria-label="$t('dms.period.preset_aria', 'Preset')"
      >
        {{ presetButtonLabel }}
      </UButton>
    </UDropdownMenu>

    <UDropdownMenu
      v-if="canCompare"
      :items="comparisonItems"
      :content="{ align: 'end' }"
    >
      <UButton
        variant="ghost"
        color="neutral"
        :size="size"
        :icon="COMPARISON_ICON"
        :trailing-icon="CHEVRON_ICON"
        :aria-label="$t('dms.period.comparison_aria', 'Comparison')"
      >
        {{ comparisonButtonLabel }}
      </UButton>
    </UDropdownMenu>

    <UPopover v-if="isCustomEnabled" v-model:open="isCustomPopoverOpen">
      <UButton
        v-bind="customButtonAppearance"
        :size="size"
        :icon="CUSTOM_ICON"
        :aria-label="$t('dms.period.custom_range_aria', 'Custom range')"
      >
        <span v-if="isCustomActive">{{ customLabel }}</span>
      </UButton>
      <template #content>
        <UCalendar
          v-model="customCalendarValue as DateRange | null"
          range
          @update:model-value="applyCustomRange"
        />
      </template>
    </UPopover>

    <span v-if="showRangeLabel" class="text-dimmed hidden text-xs sm:inline">
      {{ rangeDisplay }}
    </span>
  </div>
</template>
