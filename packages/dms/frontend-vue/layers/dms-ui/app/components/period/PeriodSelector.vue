<script setup lang="ts">
import { EYEBROW_CLASS } from "../../build/utils/eyebrow";
import { onBeforeUnmount } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { registerPeriodScope } from "#dms-core/app/composables/period/usePeriodScope";
import { usePeriod } from "#dms-core/app/composables/period/usePeriod";
import type {
  PeriodComparison,
  PeriodPreset,
} from "#dms-core/app/composables/period/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { usePeriodDraft } from "../../build/composables/period/usePeriodDraft";
import {
  type ComparisonControl,
  resolveComparisonControl,
} from "../../build/composables/period/periodComparisonControl";
import { usePeriodLocation } from "../../build/composables/period/usePeriodLocation";
import PeriodRangeCalendar from "../../build/components/period/PeriodRangeCalendar.vue";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { usePageLive } from "../../composables/live/usePageLive";
import { useLivePeriodSpan } from "../../build/composables/live/useLivePeriodSpan";
import { usePageToolbar } from "../../build/composables/page-toolbar/pageToolbarContext";
import {
  CALENDAR_ICON,
  CUSTOM_PRESET,
  NO_COMPARISON,
  comparisonKeyClass,
  usePeriodSelectorLayout,
  usePeriodSelectorPresets,
  usePeriodSelectorSegments,
  usePeriodSelectorRangeLabels,
  usePeriodSelectorComparison,
} from "./periodSelectorPresentation";
import { usePeriodSelectorInteraction } from "./usePeriodSelectorInteraction";

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
  rangeLabel?: "absolute" | "relative";
  comparisonControl?: ComparisonControl;
  rememberKey?: string;
  variant?: "default" | "segmented";
  maxDays?: number;
}

const CARET_DOWN_ICON = "i-ph-caret-down-light";
const CARET_UP_ICON = "i-ph-caret-up-light";

const TWO_MONTHS_QUERY = "(min-width: 768px)";

const props = withDefaults(defineProps<Props>(), {
  align: "right",
  size: undefined,
  showRangeLabel: true,
  rangeLabel: "absolute",
  variant: "default",
});

const FIELD_LABEL_CLASS = `${EYEBROW_CLASS} text-dimmed`;

useComponentEvent(props.componentId);
useWatch(props.watchActions || [], props.componentId);

const { t, locale } = useI18n();

const toolbar = usePageToolbar();
const {
  size,
  rangeLabelSizeClass,
  controlHeightClass,
  alignClass,
  triggerOrder,
  rangeLabelOrder,
  isSegmented,
} = usePeriodSelectorLayout(props, toolbar);

const { isPaused: isPagePaused } = usePageLive();
const comparisonSetup = resolveComparisonControl(props);
const period = usePeriod({
  defaultPreset: props.defaultPreset,
  defaultComparison: comparisonSetup.defaultComparison,
  presets: props.presets,
  comparisons: comparisonSetup.comparisons,
  holdClock: () => isPagePaused.value,
});

useLivePeriodSpan(() => period.state.value.range);

usePeriodLocation(period, {
  id: props.id,
  pageId: props.pageId,
  rememberKey: props.rememberKey,
  fallback: {
    preset: period.preset.value,
    comparison: period.comparison.value,
    customRange: null,
    customCompareRange: null,
  },
});

const cleanup = registerPeriodScope(props.id, period.state);
onBeforeUnmount(cleanup);

const draft = usePeriodDraft(period);

const POPOVER_ALIGN: Record<
  NonNullable<Props["align"]>,
  "start" | "center" | "end"
> = { left: "start", center: "center", right: "end" };

const POPOVER_CONTENT_CLASS =
  "w-auto max-w-[calc(100vw-2rem)] max-h-(--reka-popover-content-available-height) overflow-x-hidden overflow-y-auto overscroll-contain p-0";

const presentation = { props, period, draft, t, locale };
const presetPresentation = usePeriodSelectorPresets(presentation);
const { isCustomEnabled, presetGroups, presetItemClass, isCustomActive } =
  presetPresentation;
const isWide = useMediaQuery(TWO_MONTHS_QUERY);
const {
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
} = usePeriodSelectorInteraction(props, period, draft, isCustomEnabled);
const { weekStartsOn } = useUserRegionalPreferences();
const {
  draftDurationLabel,
  maxDaysHint,
  draftCompareLabel,
  rangeLabelText,
  triggerLabel,
  triggerAppearance,
} = usePeriodSelectorRangeLabels(presentation, presetPresentation);
const OPEN_TRIGGER_CLASS =
  "ring-primary shadow-[0_0_0_3px_var(--dms-accent-tint-strong)]";
const {
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
} = usePeriodSelectorComparison(presentation, comparisonSetup);
const segmentedItems = usePeriodSelectorSegments(
  presentation,
  presetPresentation,
  !!toolbar,
);
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
      :ui="{ content: POPOVER_CONTENT_CLASS }"
      @update:open="setOpen"
    >
      <template v-if="!isSegmented" #default>
        <UButton
          v-bind="triggerAppearance"
          :size="size"
          :icon="CALENDAR_ICON"
          :trailing-icon="isOpen ? CARET_UP_ICON : CARET_DOWN_ICON"
          :aria-label="$t('dms.period.preset_aria', 'Preset')"
          :class="[
            triggerOrder,
            controlHeightClass,
            isOpen && OPEN_TRIGGER_CLASS,
          ]"
          :ui="{ trailingIcon: 'text-dimmed -me-0.5' }"
        >
          <span
            data-allow-mismatch="text"
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
          class="inline-flex max-w-full min-w-0"
          :class="triggerOrder"
          data-allow-mismatch="text"
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
                  @click="selectDraftPreset(entry.preset)"
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
                  @click="selectDraftPreset(CUSTOM_PRESET)"
                >
                  <UIcon :name="CALENDAR_ICON" class="size-4 shrink-0" />
                  {{ $t("dms.period.popover.custom_range", "Custom range") }}
                </button>
              </template>
            </div>
          </div>

          <!-- Dates, comparison, calendar (design .ps-pop__main) -->
          <div class="grid min-w-0 gap-3.5 px-4 pt-3.5">
            <!-- Start and end side by side from 22rem: a 320px phone has no
                 room for two date fields on one line. -->
            <div
              class="grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2 md:grid-cols-[1fr_1fr_1.25fr]"
            >
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
                v-if="canChooseComparison"
                class="grid gap-1 min-[22rem]:col-span-2 md:col-span-1"
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
              :max-days="maxDays"
              @update:model-value="selectCalendarRange($event)"
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
                <template v-if="maxDaysHint">· {{ maxDaysHint }}</template>
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

    <UButton
      v-if="toggledComparison"
      variant="ghost"
      color="neutral"
      :size="size"
      :aria-pressed="hasComparison"
      :disabled="isComparisonDisabled"
      class="order-2"
      :class="[
        controlHeightClass,
        hasComparison ? 'text-toned' : 'text-dimmed',
      ]"
      @click="toggleComparison"
    >
      <template #leading>
        <span
          class="h-[2.5px] w-3 shrink-0 rounded-[2px]"
          :class="comparisonKeyClass(hasComparison)"
          aria-hidden="true"
        />
      </template>
      {{ comparisonLabel(toggledComparison) }}
    </UButton>

    <UDropdownMenu
      v-else-if="isComparisonMenu"
      :items="comparisonItems"
      :content="{ align: 'end' }"
      :disabled="isComparisonDisabled"
    >
      <UButton
        variant="ghost"
        color="neutral"
        :size="size"
        :disabled="isComparisonDisabled"
        :trailing-icon="CARET_DOWN_ICON"
        :aria-label="comparisonMenuAria"
        :title="comparisonLabel(period.comparison.value)"
        class="text-muted order-2"
        :class="controlHeightClass"
        :ui="{ trailingIcon: 'text-dimmed' }"
      >
        <template #leading>
          <span
            class="h-[2.5px] w-3 shrink-0 rounded-[2px]"
            :class="comparisonKeyClass(hasComparison)"
            aria-hidden="true"
          />
        </template>
        {{ comparisonMenuLabel }}
      </UButton>
    </UDropdownMenu>

    <!-- The range is computed from the current time in the reader's zone:
         a render that straddles a minute, or a server in another zone, may
         print other bounds than the browser, which then corrects them. -->
    <span
      v-if="showRangeLabel && rangeLabelText"
      data-allow-mismatch="text"
      class="dms-period-selector__range text-dimmed hidden font-mono font-medium whitespace-nowrap tabular-nums sm:inline"
      :class="[rangeLabelOrder, rangeLabelSizeClass]"
    >
      <b class="text-toned font-[550]">{{ rangeLabelText }}</b>
      <template v-if="rangeLabelCompare">
        ·
        <span class="text-(--dms-chart-2)">
          {{ $t("dms.period.popover.vs", "vs") }}
        </span>
        {{ rangeLabelCompare }}
      </template>
    </span>
  </div>
</template>
