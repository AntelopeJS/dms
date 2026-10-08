<script setup lang="ts">
import { computed } from "vue";
import DmsStatCell from "../../build/components/stat/StatCell.vue";
import DmsEyebrow from "../section-header/Eyebrow.vue";
// Imported rather than resolved from the registry: a registered component is
// a lazy chunk of its own, fetched only when the data first shows it, so the
// trend would pop in a beat after the value.
import DmsTrendBadge from "../chart/internal/TrendBadge.vue";
import DmsSparkline from "../chart/internal/Sparkline.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import {
  ABSENT_VALUE_PARTS,
  formatValueParts,
} from "../../composables/chart/formatValue";
import { resolveSparklineAccent } from "../../composables/chart/resolveSparklineAccent";
import type {
  KpiCardResponse,
  ValueFormat,
  ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  title: string;
  /**
   * "stat" = the compact stat card (a StatGroup `cards` cell): icon well,
   * label + value, delta.
   */
  variant?: "default" | "stat";
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  showSparkline?: boolean;
  sparklineAccent?: string;
  invert?: boolean;
  compareLabel?: string;
  staticValue?: number;
  staticDelta?: number;
  staticSparkline?: number[];
}

const DEFAULT_FALLBACK_ICON = "i-ph-chart-bar";
// v2 KPI sparklines are cyan when the trend is good, not green.
const POSITIVE_SPARKLINE_ACCENT = "primary";

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
  showDelta: true,
  showSparkline: false,
  valueFormat: "compact",
  sparklineAccent: "auto",
  currencyCode: "EUR",
});

const { locale, t } = useI18n();
const { processI18n } = useTranslation();
useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);
const watchKey = computed(() => JSON.stringify(watchState.value));

const staticData = computed<KpiCardResponse | null>(() => {
  if (props.staticValue === undefined) return null;
  return {
    value: props.staticValue,
    delta: props.staticDelta,
    sparkline: props.staticSparkline,
  };
});

const { data, isLoading, error, refresh } = useChartFetch<KpiCardResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
  periodScope: props.periodScope,
  staticData: () => staticData.value,
  watchSource: () => watchKey.value,
});

const value = computed(() => data.value?.value);
const delta = computed(() => data.value?.delta ?? null);
const sparkline = computed(() => data.value?.sparkline ?? []);

const formattedParts = computed(() =>
  value.value === undefined
    ? ABSENT_VALUE_PARTS
    : formatValueParts(
        value.value,
        props.valueFormat,
        locale.value,
        props.currencyCode,
        props.valuePrecision,
      ),
);

const isFirstLoad = computed(() => isLoading.value && data.value === null);
// v2 error state: a failed first load shows a message and a retry button in
// place of the value; a failed refetch keeps the last value.
const hasError = computed(
  () => !isLoading.value && data.value === null && Boolean(error.value),
);
// A refetch keeps the stale value on screen, faded, instead of a skeleton.
const isRefreshing = computed(() => isLoading.value && data.value !== null);
const showTrend = computed(() => props.showDelta && delta.value !== null);
const hasSparkline = computed(
  () => props.showSparkline && sparkline.value.length > 0,
);
const footnote = computed(() => {
  const text = props.compareLabel || props.description;
  return text ? processI18n(text) : "";
});

const resolvedSparklineAccent = computed(() =>
  resolveSparklineAccent(
    props.sparklineAccent,
    { delta: delta.value, sparkline: sparkline.value, invert: props.invert },
    POSITIVE_SPARKLINE_ACCENT,
  ),
);

const resolvedIcon = computed(() => props.icon || DEFAULT_FALLBACK_ICON);
const isStat = computed(() => props.variant === "stat");
</script>

<template>
  <DmsStatCell
    v-if="isStat"
    :eyebrow="processI18n(title)"
    :icon="resolvedIcon"
    :loading="isFirstLoad"
    :refreshing="isRefreshing"
    :aria-busy="isFirstLoad"
  >
    <template #value>
      <span
        v-if="formattedParts.unit && formattedParts.unitIsPrefix"
        class="text-muted mr-0.5 text-[0.6em] font-medium"
      >
        {{ formattedParts.unit }}
      </span>
      <span>{{ formattedParts.value }}</span>
      <span
        v-if="formattedParts.unit && !formattedParts.unitIsPrefix"
        class="text-muted ml-0.5 text-[0.6em] font-medium"
      >
        {{ formattedParts.unit }}
      </span>
    </template>
    <!-- With no change to show (no comparison period), the trend's line
         keeps its place: toggling a comparison never resizes the card. -->
    <template v-if="showDelta || hasSparkline" #aside>
      <div class="ml-auto grid shrink-0 justify-items-end gap-1">
        <DmsTrendBadge
          v-if="showTrend"
          :delta="delta"
          :invert="invert"
          variant="text"
        />
        <span v-else-if="showDelta" class="h-4" aria-hidden="true" />
        <div v-if="hasSparkline" class="h-6 w-16">
          <DmsSparkline
            :values="sparkline"
            :accent="resolvedSparklineAccent"
            :aria-label="processI18n(title)"
          />
        </div>
      </div>
    </template>
  </DmsStatCell>

  <DmsCard
    v-else
    :padded="false"
    class="flex min-h-[132px] flex-col gap-1.5 px-4 py-4 sm:px-[18px]"
    :aria-busy="isFirstLoad"
  >
    <div class="flex min-w-0 items-center gap-2">
      <UIcon
        :name="resolvedIcon"
        class="text-dimmed size-[15px] shrink-0"
        :aria-hidden="true"
      />
      <DmsEyebrow
        tone="muted"
        truncate
        class="max-sm:whitespace-normal"
        :label="processI18n(title)"
      />
    </div>
    <!-- The value's placeholder takes its 33px line. -->
    <USkeleton v-if="isFirstLoad" class="mt-1 h-[33px] w-32" />
    <div
      v-else-if="hasError"
      class="mt-auto flex items-center justify-between gap-2"
      role="alert"
    >
      <p class="text-error flex min-w-0 items-center gap-1.5 text-[12.5px]">
        <UIcon name="i-ph-warning-circle" class="size-4 shrink-0" />
        <span class="truncate">{{ t("dms.table.load_error_title") }}</span>
      </p>
      <UButton
        :label="t('dms.table.load_error_retry')"
        icon="i-ph-arrows-clockwise"
        color="neutral"
        variant="outline"
        size="xs"
        @click="refresh()"
      />
    </div>
    <p
      v-else
      class="text-highlighted mt-1 text-[30px] leading-[1.1] font-[650] tracking-[-0.035em] tabular-nums transition-opacity"
      :class="isRefreshing && 'opacity-55'"
    >
      <span
        v-if="formattedParts.unit && formattedParts.unitIsPrefix"
        class="text-muted mr-0.5 text-[0.6em] font-medium tracking-[-0.01em]"
      >
        {{ formattedParts.unit }}
      </span>
      <span>{{ formattedParts.value }}</span>
      <span
        v-if="formattedParts.unit && !formattedParts.unitIsPrefix"
        class="text-muted ml-0.5 text-[0.6em] font-medium tracking-[-0.01em]"
      >
        {{ formattedParts.unit }}
      </span>
    </p>
    <!-- The trend (a 24px line) and the footnote (16px) as the loaded card
         lays them out; the footnote is a prop, so it is known up front. -->
    <div
      v-if="isFirstLoad && (showDelta || footnote || showSparkline)"
      class="mt-auto flex items-end gap-2"
    >
      <div class="grid">
        <div v-if="showDelta" class="flex h-6 items-center">
          <USkeleton class="h-3 w-[58px]" />
        </div>
        <div v-if="footnote" class="flex h-4 items-center">
          <USkeleton class="h-2.5 w-28" />
        </div>
      </div>
      <USkeleton v-if="showSparkline" class="ml-auto h-[34px] w-24" />
    </div>
    <!-- The trend's line holds its place, as in the skeleton, while there is
         no change to show (no comparison period): no "0%" stand-in, and
         toggling a comparison never moves the footnote. -->
    <div
      v-else-if="!hasError && (showDelta || footnote || hasSparkline)"
      class="mt-auto flex items-end gap-2"
    >
      <div class="min-w-0">
        <div v-if="showDelta" class="flex h-6 items-center">
          <DmsTrendBadge
            v-if="showTrend"
            :delta="delta"
            :invert="invert"
            variant="text"
          />
        </div>
        <p
          v-if="footnote"
          class="text-dimmed truncate text-xs max-sm:whitespace-normal"
        >
          {{ footnote }}
        </p>
      </div>
      <div
        v-if="hasSparkline"
        class="ml-auto h-[34px] w-24 shrink-0 transition-opacity"
        :class="isRefreshing && 'opacity-55'"
      >
        <DmsSparkline
          :values="sparkline"
          :accent="resolvedSparklineAccent"
          :aria-label="processI18n(title)"
        />
      </div>
    </div>
  </DmsCard>
</template>
