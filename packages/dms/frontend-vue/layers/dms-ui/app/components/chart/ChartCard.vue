<script setup lang="ts">
import { computed, provide, reactive, watchEffect } from "vue";
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

// Comparison series/dot follow the neutral theme token (design --fg-tertiary)
// instead of a hardcoded slate; re-resolved on theme changes via
// useThemeRevision so they track light/dark mode.
const themeRevision = useThemeRevision();
const comparisonColor = computed(() => {
  void themeRevision.value;
  return resolveChartColor("neutral");
});
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

const primaryDotColor = computed(() => resolveChartColor("primary"));
</script>

<template>
  <DmsCard>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-muted text-sm">{{ processI18n(title) }}</p>
        <div class="text-2xl font-semibold tracking-tight tabular-nums">
          <USkeleton v-if="isLoading && data === null" class="h-8 w-32" />
          <span v-else>{{ formatted }}</span>
        </div>
        <div
          v-if="
            (showDelta && delta !== null) || previousFormatted || description
          "
          class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <DmsTrendBadge v-if="showDelta && delta !== null" :delta="delta" />
          <span v-if="previousFormatted" class="text-muted text-xs">
            vs {{ previousFormatted }}
          </span>
          <span v-else-if="description" class="text-muted text-xs">
            {{ processI18n(description) }}
          </span>
        </div>
      </div>
      <div
        v-if="showLegend && hasComparison"
        class="flex items-center gap-3 text-xs"
      >
        <span class="flex items-center gap-1.5">
          <span
            class="size-2.5 rounded-full"
            :style="{ background: primaryDotColor }"
            aria-hidden="true"
          />
          {{ primaryLegendLabel }}
        </span>
        <span class="text-muted flex items-center gap-1.5">
          <span
            class="size-2.5 rounded-full"
            :style="{ background: comparisonColor }"
            aria-hidden="true"
          />
          {{ comparisonLegendLabel }}
        </span>
      </div>
    </div>
    <slot :series="cardSeries" :comparison-series="cardComparisonSeries" />
  </DmsCard>
</template>
