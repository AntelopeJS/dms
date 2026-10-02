<script setup lang="ts">
import { computed, provide, reactive, watchEffect } from "vue";
import DmsEyebrow from "../section-header/Eyebrow.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import {
  ABSENT_VALUE_TEXT,
  formatValue,
} from "../../composables/chart/formatValue";
import { resolveChartColor } from "../../composables/chart/useChartTheme";
import { useThemeRevision } from "../../composables/chart/useThemeRevision";
import {
  NESTED_CHART_INJECT_KEY,
  type ChartCardResponse,
  type ChartSeries,
  type NestedChartContext,
  type ValueFormat,
  type ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  title: string;
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  showLegend?: boolean;
  primaryLabel?: string;
  comparisonLabel?: string;
}

// The comparison series takes palette step 2 (v2 violet), re-resolved on
// theme changes via useThemeRevision so it tracks light/dark mode.
const COMPARISON_COLOR_TOKEN = "--dms-chart-2";
const themeRevision = useThemeRevision();
const comparisonColor = computed(() => {
  void themeRevision.value;
  return resolveChartColor(COMPARISON_COLOR_TOKEN);
});
const LEGEND_KEY_CLASS = "size-2 shrink-0 rounded-[2.5px]";
const DEFAULT_PRIMARY_LABEL_KEY = "dms.chart.legend_period";
const DEFAULT_COMPARISON_LABEL_KEY = "dms.chart.legend_comparison";

const props = withDefaults(defineProps<Props>(), {
  showDelta: true,
  showLegend: true,
  valueFormat: "compact",
  currencyCode: "EUR",
});

const { t, locale } = useI18n();
const { processI18n } = useTranslation();
useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);
const watchKey = computed(() => JSON.stringify(watchState.value));

const { data, isLoading } = useChartFetch<ChartCardResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  watchSource: () => watchKey.value,
});

const value = computed(() => data.value?.value);
const previousValue = computed(() => data.value?.previousValue);
const delta = computed(() => data.value?.delta ?? null);

// ApexCharts prints `name` verbatim in its legend and tooltip, so backend
// series names carrying the `$` convention are resolved here, before the
// array reaches the nested chart and the default slot.
function withResolvedName(entry: ChartSeries): ChartSeries {
  return { ...entry, name: processI18n(entry.name) };
}

const cardSeries = computed<ChartSeries[]>(() =>
  (data.value?.series ?? []).map(withResolvedName),
);

const cardComparisonSeries = computed<ChartSeries[]>(() =>
  (data.value?.comparisonSeries ?? []).map((entry) => ({
    ...withResolvedName(entry),
    color: entry.color ?? comparisonColor.value,
  })),
);

const formatted = computed(() =>
  value.value === undefined
    ? ABSENT_VALUE_TEXT
    : formatValue(
        value.value,
        props.valueFormat,
        locale.value,
        props.currencyCode,
        props.valuePrecision,
      ),
);

const previousFormatted = computed(() =>
  previousValue.value !== undefined
    ? formatValue(
        previousValue.value,
        props.valueFormat,
        locale.value,
        props.currencyCode,
        props.valuePrecision,
      )
    : null,
);

const hasComparison = computed(() => cardComparisonSeries.value.length > 0);

const nestedContext = reactive<NestedChartContext>({
  cardSeries: [],
  cardComparisonSeries: [],
  isLoading: false,
  hideLegend: true,
  valueFormat: props.valueFormat,
  currencyCode: props.currencyCode,
  valuePrecision: props.valuePrecision,
});

provide(NESTED_CHART_INJECT_KEY, nestedContext);

watchEffect(() => {
  nestedContext.cardSeries = cardSeries.value;
  nestedContext.cardComparisonSeries = cardComparisonSeries.value;
  nestedContext.isLoading = isLoading.value;
  nestedContext.valueFormat = props.valueFormat;
  nestedContext.currencyCode = props.currencyCode;
  nestedContext.valuePrecision = props.valuePrecision;
});

const primaryLegendLabel = computed(() =>
  props.primaryLabel
    ? processI18n(props.primaryLabel)
    : t(DEFAULT_PRIMARY_LABEL_KEY, "Period"),
);
const comparisonLegendLabel = computed(() =>
  props.comparisonLabel
    ? processI18n(props.comparisonLabel)
    : t(DEFAULT_COMPARISON_LABEL_KEY, "Comparison"),
);

const showTrend = computed(() => props.showDelta && delta.value !== null);
const hasMeta = computed(
  () => showTrend.value || !!previousFormatted.value || !!props.description,
);
</script>

<template>
  <DmsCard :padded="false" class="flex min-w-0 flex-col">
    <div class="flex flex-wrap items-start gap-3 px-4 pt-4 pb-1.5 sm:px-[18px]">
      <div class="grid min-w-0 justify-items-start">
        <DmsEyebrow
          tone="muted"
          truncate
          class="max-w-full max-sm:whitespace-normal"
          :label="processI18n(title)"
        />
        <div
          class="text-highlighted mt-2 text-[30px] leading-[1.1] font-[650] tracking-[-0.035em] tabular-nums"
        >
          <USkeleton
            v-if="isLoading && data === null"
            class="h-[30px] w-36 bg-(--dms-skeleton)"
          />
          <span v-else>{{ formatted }}</span>
        </div>
        <div v-if="hasMeta" class="mt-1.5 flex flex-wrap items-center gap-2">
          <DmsTrendBadge v-if="showTrend" :delta="delta" />
          <span v-if="previousFormatted" class="text-dimmed text-xs">
            vs {{ previousFormatted }}
          </span>
          <span v-else-if="description" class="text-dimmed text-xs">
            {{ processI18n(description) }}
          </span>
        </div>
      </div>
      <div
        v-if="showLegend && hasComparison"
        class="text-muted ml-auto flex items-center gap-3.5 text-xs"
      >
        <span class="flex items-center gap-1.5">
          <span
            :class="LEGEND_KEY_CLASS"
            class="bg-(--dms-sparkline)"
            aria-hidden="true"
          />
          {{ primaryLegendLabel }}
        </span>
        <span class="flex items-center gap-1.5">
          <span
            :class="LEGEND_KEY_CLASS"
            :style="{ background: comparisonColor }"
            aria-hidden="true"
          />
          {{ comparisonLegendLabel }}
        </span>
      </div>
    </div>
    <div class="px-3.5 pt-2.5 pb-3.5 sm:pr-[18px]">
      <slot :series="cardSeries" :comparison-series="cardComparisonSeries" />
    </div>
  </DmsCard>
</template>
