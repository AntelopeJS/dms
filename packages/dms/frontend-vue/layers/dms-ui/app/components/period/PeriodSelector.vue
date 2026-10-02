<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { useMediaQuery } from "@vueuse/core";
import { registerPeriodScope } from "#dms-core/app/composables/period/usePeriodScope";
import { usePeriod } from "#dms-core/app/composables/period/usePeriod";
import type {
  PeriodComparison,
  PeriodPreset,
  PeriodRange,
} from "#dms-core/app/composables/period/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { usePeriodDraft } from "../../composables/period/usePeriodDraft";
import {
  type CalendarRange,
  calendarToRange,
  formatPeriodRange,
  periodDuration,
  rangeToCalendar,
} from "../../composables/period/periodDisplay";
import PeriodRangeCalendar from "./PeriodRangeCalendar.vue";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";

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

const CALENDAR_ICON = "i-ph-calendar-blank-light";
const CARET_DOWN_ICON = "i-ph-caret-down-light";
const CARET_UP_ICON = "i-ph-caret-up-light";
const CUSTOM_PRESET: PeriodPreset = "custom";
const NO_COMPARISON: PeriodComparison = "none";
const SEGMENTED_VARIANT: NonNullable<Props["variant"]> = "segmented";
// Two months side by side from this width; one below (design @container 760px).
const TWO_MONTHS_QUERY = "(min-width: 768px)";

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

/** Short mono codes, as trails in the preset list and segmented labels. */
const PRESET_SHORT_LABELS: Partial<Record<PeriodPreset, string>> = {
  "last-hour": "1H",
  "last-24h": "24H",
  today: "1D",
  "last-7-days": "7D",
  "last-30-days": "30D",
  "last-90-days": "90D",
  "this-quarter": "QTD",
  ytd: "YTD",
};

/** Rolling windows first, then calendar periods (design preset groups). */
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
const FIELD_LABEL_CLASS =
  "text-dimmed font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase";

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

// Every change in the popover is staged here; charts follow `period.state`,
// which only moves on Apply.
const draft = usePeriodDraft(period);

const alignClass = computed(() => ALIGN_CLASSES[props.align]);
// Right-aligned (page header) selectors end on the trigger, the popover
// anchored under it; elsewhere the trigger leads.
const isTrailing = computed(() => props.align === "right");
const triggerOrder = computed(() => (isTrailing.value ? "order-3" : "order-1"));
const rangeLabelOrder = computed(() =>
  isTrailing.value ? "order-1" : "order-3",
);
const POPOVER_ALIGN: Record<
  NonNullable<Props["align"]>,
  "start" | "center" | "end"
> = { left: "start", center: "center", right: "end" };

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

function compareOptionLabel(comparison: PeriodComparison): string {
  return (
    props.comparisonLabels?.[comparison] ??
    t(`dms.period.compare_options.${comparison}`, comparison)
  );
}

const isCustomEnabled = computed(() =>
  period.presets.value.includes(CUSTOM_PRESET),
);

const listedPresets = computed(() =>
  period.presets.value.filter((preset) => preset !== CUSTOM_PRESET),
);

interface PresetEntry {
  preset: PeriodPreset;
  label: string;
  short?: string;
}

function presetEntry(preset: PeriodPreset): PresetEntry {
  const label = presetLabel(preset);
  const short = PRESET_SHORT_LABELS[preset];
  return { preset, label, short: short === label ? undefined : short };
}

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

const isSegmented = computed(() => props.variant === SEGMENTED_VARIANT);
const isCustomActive = computed(() => period.preset.value === CUSTOM_PRESET);

// ── Popover ────────────────────────────────────────────────────────────
const isOpen = ref(false);
const isWide = useMediaQuery(TWO_MONTHS_QUERY);
const pendingStart = ref<CalendarDate | null>(null);

function setOpen(open: boolean) {
  if (open) draft.reset();
  pendingStart.value = null;
  isOpen.value = open;
}

function openCustom() {
  draft.reset();
  draft.selectPreset(CUSTOM_PRESET);
  pendingStart.value = null;
  isOpen.value = true;
}

function applyDraft() {
  draft.apply();
  isOpen.value = false;
}

const draftCalendar = computed<CalendarRange>(() =>
  rangeToCalendar(draft.range.value),
);

const draftCompareCalendar = computed<CalendarRange | null>(() => {
  const compare = draft.compareRange.value;
  return compare ? rangeToCalendar(compare) : null;
});

function selectCalendarRange(range: CalendarRange) {
  if (!isCustomEnabled.value) return;
  draft.selectRange(calendarToRange(range));
}

function updateStart(value: DateValue | null | undefined) {
  if (!value) return;
  const start = value as CalendarDate;
  const end = draftCalendar.value.end;
  selectCalendarRange(
    start.compare(end) > 0 ? { start, end: start } : { start, end },
  );
}

function updateEnd(value: DateValue | null | undefined) {
  if (!value) return;
  const end = value as CalendarDate;
  const start = draftCalendar.value.start;
  selectCalendarRange(
    end.compare(start) < 0 ? { start: end, end } : { start, end },
  );
}

const { weekStartsOn } = useUserRegionalPreferences();

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

const draftDurationLabel = computed(() => {
  const { unit, count } = periodDuration(draft.range.value);
  return t(`dms.period.popover.${unit}`, { count }, count);
});

const draftCompareLabel = computed(() => {
  const compare = draft.compareRange.value;
  return compare ? formatPeriodRange(compare, locale.value) : null;
});

// ── Trigger, comparison chip, range label ──────────────────────────────
const committedRangeLabel = computed(() =>
  formatPeriodRange(period.state.value.range, locale.value),
);

const triggerLabel = computed(() =>
  isCustomActive.value
    ? committedRangeLabel.value
    : presetLabel(period.preset.value),
);

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

const triggerAppearance = computed<ButtonAppearance>(() =>
  isCustomActive.value ? CUSTOM_TRIGGER : PRESET_TRIGGER,
);

// Open trigger: accent border and a 3px accent halo (design .ps__trigger.is-open).
const OPEN_TRIGGER_CLASS =
  "ring-primary shadow-[0_0_0_3px_var(--dms-accent-tint-strong)]";

const canCompare = computed(() =>
  period.comparisons.value.some((comparison) => comparison !== NO_COMPARISON),
);

const comparisonItems = computed(() => [
  period.comparisons.value.map((comparison) => ({
    label: comparisonLabel(comparison),
    onSelect: () => period.setComparison(comparison),
  })),
]);

const hasComparison = computed(() => period.comparison.value !== NO_COMPARISON);

// The comparison key mirrors the dashed violet comparison series of charts.
const COMPARISON_KEY_ACTIVE =
  "bg-[repeating-linear-gradient(90deg,var(--dms-chart-2)_0_4px,transparent_4px_7px)]";
const COMPARISON_KEY_NONE = "bg-(--ui-border-accented)";

function comparisonKeyClass(active: boolean): string {
  return active ? COMPARISON_KEY_ACTIVE : COMPARISON_KEY_NONE;
}

function compareRangeText(compare: PeriodRange, main: PeriodRange): string {
  const sameYear = compare.to.getFullYear() === main.to.getFullYear();
  return formatPeriodRange(compare, locale.value, !sameYear);
}

const compareRangeLabel = computed(() => {
  const { compareRange, range } = period.state.value;
  return compareRange ? compareRangeText(compareRange, range) : null;
});

// ── Segmented variant ──────────────────────────────────────────────────
function segmentLabel(preset: PeriodPreset): string {
  return (
    props.presetLabels?.[preset] ??
    PRESET_SHORT_LABELS[preset] ??
    presetLabel(preset)
  );
}

interface SegmentItem {
  label: string;
  value: string;
  icon?: string;
}

const segmentedItems = computed<SegmentItem[]>(() => {
  const items: SegmentItem[] = listedPresets.value.map((preset) => ({
    label: segmentLabel(preset),
    value: preset,
  }));
  if (isCustomEnabled.value) {
    items.push({
      label: isCustomActive.value
        ? formatPeriodRange(period.state.value.range, locale.value, false)
        : presetLabel(CUSTOM_PRESET),
      value: CUSTOM_PRESET,
      icon: CALENDAR_ICON,
    });
  }
  return items;
});

const segmentedPreset = computed<string | number | undefined>({
  get: () => period.preset.value,
  set: (value) => {
    const preset = period.presets.value.find((entry) => entry === value);
    if (!preset) return;
    // Custom opens the popover; the range applies from there.
    if (preset === CUSTOM_PRESET) openCustom();
    else period.setPreset(preset);
  },
});

// A click on the custom segment while it is already active changes no value,
// so it reopens the popover from here.
function onSegmentedClick(event: MouseEvent) {
  if (!isCustomActive.value) return;
  const segment = (event.target as HTMLElement | null)?.closest(
    "[role='radio']",
  );
  if (segment?.getAttribute("aria-checked") === "true") openCustom();
}
</script>

<template>
  <div
    class="dms-period-selector flex flex-wrap items-center gap-2"
    :class="alignClass"
    role="group"
    :aria-label="$t('dms.period.aria_label', 'Period selector')"
  >
    <UPopover
      :open="isOpen"
      :content="{
        align: POPOVER_ALIGN[align],
        sideOffset: 6,
        collisionPadding: 16,
      }"
      :ui="{ content: 'w-auto max-w-[calc(100vw-2rem)] overflow-hidden p-0' }"
      @update:open="setOpen"
    >
      <template v-if="!isSegmented" #default>
        <UButton
          v-bind="triggerAppearance"
          :size="size"
          :icon="CALENDAR_ICON"
          :trailing-icon="isOpen ? CARET_UP_ICON : CARET_DOWN_ICON"
          :aria-label="$t('dms.period.preset_aria', 'Preset')"
          :class="[triggerOrder, isOpen && OPEN_TRIGGER_CLASS]"
          :ui="{ trailingIcon: 'text-dimmed -me-0.5' }"
        >
          <span
            :class="
              isCustomActive && 'font-mono text-[0.92em] tracking-[0.01em]'
            "
          >
            {{ triggerLabel }}
          </span>
        </UButton>
      </template>

      <template v-else #anchor>
        <span
          class="inline-flex"
          :class="triggerOrder"
          @click="onSegmentedClick"
        >
          <DmsSegmented
            v-model="segmentedPreset"
            :items="segmentedItems"
            :size="size"
            variant="mono"
            :aria-label="$t('dms.period.preset_aria', 'Preset')"
          />
        </span>
      </template>

      <template #content>
        <div
          class="grid grid-cols-1 sm:grid-cols-[150px_auto] md:grid-cols-[184px_auto]"
          role="dialog"
          :aria-label="$t('dms.period.popover.dialog_aria', 'Choose period')"
        >
          <!-- Presets (design .ps-pop__presets) -->
          <div
            class="border-default border-b bg-(--dms-bg-muted) px-1.5 py-2 sm:border-e sm:border-b-0"
          >
            <span
              :class="FIELD_LABEL_CLASS"
              class="hidden px-2 py-1.5 sm:block"
            >
              {{ $t("dms.period.popover.presets", "Presets") }}
            </span>
            <div
              class="flex gap-0.5 overflow-x-auto sm:flex-col sm:overflow-visible"
              role="listbox"
              :aria-label="$t('dms.period.popover.presets', 'Presets')"
            >
              <template
                v-for="(group, groupIndex) in presetGroups"
                :key="groupIndex"
              >
                <div
                  v-if="groupIndex > 0"
                  class="-mx-1.5 my-[5px] hidden h-px bg-(--ui-border) sm:block"
                  role="separator"
                />
                <button
                  v-for="entry in group"
                  :key="entry.preset"
                  type="button"
                  role="option"
                  :aria-selected="draft.preset.value === entry.preset"
                  :class="presetItemClass(entry.preset)"
                  @click="draft.selectPreset(entry.preset)"
                >
                  <span class="truncate">{{ entry.label }}</span>
                  <span
                    v-if="entry.short"
                    class="ms-auto font-mono text-[10.5px] font-medium tracking-[0.04em]"
                    :class="
                      draft.preset.value === entry.preset
                        ? 'text-primary'
                        : 'text-dimmed'
                    "
                  >
                    {{ entry.short }}
                  </span>
                </button>
              </template>
              <template v-if="isCustomEnabled">
                <div
                  class="-mx-1.5 my-[5px] hidden h-px bg-(--ui-border) sm:block"
                  role="separator"
                />
                <button
                  type="button"
                  role="option"
                  :aria-selected="draft.preset.value === CUSTOM_PRESET"
                  :class="presetItemClass(CUSTOM_PRESET)"
                  @click="draft.selectPreset(CUSTOM_PRESET)"
                >
                  <UIcon :name="CALENDAR_ICON" class="size-4 shrink-0" />
                  {{ $t("dms.period.popover.custom_range", "Custom range") }}
                </button>
              </template>
            </div>
          </div>

          <!-- Dates, comparison, calendar (design .ps-pop__main) -->
          <div class="grid min-w-0 gap-3.5 px-4 pt-3.5">
            <div class="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1.25fr]">
              <label class="grid gap-1">
                <span :class="FIELD_LABEL_CLASS">
                  {{ $t("dms.period.popover.start", "Start") }}
                </span>
                <UInputDate
                  :model-value="draftCalendar.start"
                  :locale="locale"
                  :disabled="!isCustomEnabled"
                  size="sm"
                  class="w-full"
                  :ui="{ base: 'font-mono text-xs' }"
                  @update:model-value="updateStart"
                />
              </label>
              <label class="grid gap-1">
                <span :class="FIELD_LABEL_CLASS">
                  {{ $t("dms.period.popover.end", "End") }}
                </span>
                <UInputDate
                  :model-value="draftCalendar.end"
                  :locale="locale"
                  :disabled="!isCustomEnabled"
                  :highlight="!!pendingStart"
                  size="sm"
                  class="w-full"
                  :ui="{ base: 'font-mono text-xs' }"
                  @update:model-value="updateEnd"
                />
              </label>
              <label
                v-if="canCompare"
                class="col-span-2 grid gap-1 md:col-span-1"
              >
                <span :class="FIELD_LABEL_CLASS">
                  {{ $t("dms.period.popover.compare_to", "Compare to") }}
                </span>
                <USelect
                  v-model="draftComparison"
                  :items="compareSelectItems"
                  size="sm"
                  class="w-full"
                  :ui="{ base: 'text-xs' }"
                >
                  <template #leading>
                    <span
                      class="block h-[2.5px] w-3 shrink-0 rounded-[2px]"
                      :class="
                        comparisonKeyClass(draftComparison !== NO_COMPARISON)
                      "
                      aria-hidden="true"
                    />
                  </template>
                </USelect>
              </label>
            </div>

            <PeriodRangeCalendar
              :model-value="draftCalendar"
              :compare-range="draftCompareCalendar"
              :locale="locale"
              :week-starts-on="weekStartsOn"
              :number-of-months="isWide ? 2 : 1"
              :readonly="!isCustomEnabled"
              @update:model-value="selectCalendarRange"
              @pending="pendingStart = $event"
            />

            <div
              class="border-default -mx-4 flex flex-wrap items-center gap-2 border-t px-4 py-2.5"
            >
              <span
                class="text-dimmed me-auto basis-full font-mono text-[11.5px] font-medium whitespace-nowrap tabular-nums md:basis-auto"
              >
                <b class="text-toned font-[550]">{{ draftDurationLabel }}</b>
                <template v-if="draftCompareLabel">
                  ·
                  <span class="text-(--dms-chart-2)">
                    {{ $t("dms.period.popover.vs", "vs") }}
                  </span>
                  {{ draftCompareLabel }}
                </template>
              </span>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                class="ms-auto md:ms-0"
                @click="setOpen(false)"
              >
                {{ $t("dms.period.popover.cancel", "Cancel") }}
              </UButton>
              <UButton size="sm" @click="applyDraft">
                {{ $t("dms.period.popover.apply", "Apply") }}
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UPopover>

    <UDropdownMenu
      v-if="canCompare"
      :items="comparisonItems"
      :content="{ align: 'end' }"
    >
      <UButton
        variant="ghost"
        color="neutral"
        :size="size"
        :trailing-icon="CARET_DOWN_ICON"
        :aria-label="$t('dms.period.comparison_aria', 'Comparison')"
        class="text-muted order-2"
        :ui="{ trailingIcon: 'text-dimmed' }"
      >
        <template #leading>
          <span
            class="h-[2.5px] w-3 shrink-0 rounded-[2px]"
            :class="comparisonKeyClass(hasComparison)"
            aria-hidden="true"
          />
        </template>
        {{ comparisonLabel(period.comparison.value) }}
      </UButton>
    </UDropdownMenu>

    <span
      v-if="showRangeLabel"
      class="text-dimmed hidden font-mono text-[11.5px] font-medium whitespace-nowrap tabular-nums sm:inline"
      :class="rangeLabelOrder"
    >
      <b class="text-toned font-[550]">{{ committedRangeLabel }}</b>
      <template v-if="compareRangeLabel">
        ·
        <span class="text-(--dms-chart-2)">
          {{ $t("dms.period.popover.vs", "vs") }}
        </span>
        {{ compareRangeLabel }}
      </template>
    </span>
  </div>
</template>
