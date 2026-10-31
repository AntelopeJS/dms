<script setup lang="ts">
import { computed, provide, reactive } from "vue";
import {
  hasDrawablePoints,
  resolveBlockState,
  useBlockStateAttributes,
} from "../../build/composables/blocks/blockDataState";
import DmsEyebrow from "../section-header/Eyebrow.vue";

import DmsTrendBadge from "./internal/TrendBadge.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import {
  ABSENT_VALUE_TEXT,
  formatValue,
} from "../../composables/chart/formatValue";
import { resolveChartColor } from "../../composables/chart/useChartTheme";
import { useThemeRevision } from "../../composables/chart/useThemeRevision";
import { usePeriodComparisonDisplay } from "../../build/composables/period/periodComparison";
import { localizeSeries } from "../../composables/chart/localizeSeries";
import {
  NESTED_CHART_INJECT_KEY,
  type ChartCardResponse,
  type ChartSeries,
  type NestedChartContext,
  type ValueFormat,
  type ValuePrecision,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { drawableSeries } from "../../build/composables/chart/groupPoints";

interface Props extends DefaultComponentProps {
  title: string;
  description?: string;
  icon?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
  showDelta?: boolean;
  /** A rising value is the bad outcome: the delta's colours swap. */
  invert?: boolean;
  showLegend?: boolean;
  /** The wrapped chart draws its own legend, naming each series. */
  showSeriesLegend?: boolean;
  primaryLabel?: string;
  comparisonLabel?: string;
}

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
  showSeriesLegend: false,
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

const { data, isLoading, error } = useChartFetch<ChartCardResponse>({
  fetchUrl: props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
  periodScope: props.periodScope,
  realtimeTopic: props.realtimeTopic,
  watchSource: () => watchKey.value,
});

const comparison = usePeriodComparisonDisplay(props.periodScope);
const value = computed(() => data.value?.value);
const previousValue = computed(() =>
  comparison.isOff.value ? undefined : data.value?.previousValue,
);
const delta = computed(() =>
  comparison.isOff.value ? null : (data.value?.delta ?? null),
);

function localized(entry: ChartSeries): ChartSeries {
  return localizeSeries(entry, processI18n);
}

const cardSeries = computed<ChartSeries[]>(() =>
  drawableSeries(data.value?.series ?? []).map(localized),
);

const cardComparisonSeries = computed<ChartSeries[]>(() =>
  comparison.isOff.value
    ? []
    : drawableSeries(data.value?.comparisonSeries ?? []).map((entry) => ({
        ...localized(entry),
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
    ? t("dms.chart.versus_value", {
        value: formatValue(
          previousValue.value,
          props.valueFormat,
          locale.value,
          props.currencyCode,
          props.valuePrecision,
        ),
      })
    : null,
);

const hasComparison = computed(() => cardComparisonSeries.value.length > 0);

const nestedContext: NestedChartContext = reactive({
  cardSeries,
  cardComparisonSeries,
  isLoading,
  hideLegend: computed(() => !props.showSeriesLegend),
  valueFormat: computed(() => props.valueFormat),
  currencyCode: computed(() => props.currencyCode),
  valuePrecision: computed(() => props.valuePrecision),
});

provide(NESTED_CHART_INJECT_KEY, nestedContext);

const primaryLegendLabel = computed(() =>
  props.primaryLabel
    ? processI18n(props.primaryLabel)
    : t(DEFAULT_PRIMARY_LABEL_KEY, "Period"),
);

const comparisonLegendLabel = computed(() =>
  props.comparisonLabel
    ? processI18n(props.comparisonLabel)
    : (comparison.legendLabel.value ??
      t(DEFAULT_COMPARISON_LABEL_KEY, "Comparison")),
);

const blockAttributes = useBlockStateAttributes("ChartCard", () =>
  resolveBlockState({
    loading: isLoading.value,
    failed: Boolean(error.value),
    hasContent:
      value.value !== undefined ||
      hasDrawablePoints(cardSeries.value) ||
      hasDrawablePoints(cardComparisonSeries.value),
  }),
);

const isFirstLoad = computed(() => isLoading.value && data.value === null);

const isRefreshing = computed(() => isLoading.value && data.value !== null);

const showTrend = computed(() => props.showDelta && delta.value !== null);
const hasMeta = computed(
  () => showTrend.value || !!previousFormatted.value || !!props.description,
);
</script>

<template>
  <DmsCard
    v-bind="blockAttributes"
    :padded="false"
    class="flex min-w-0 flex-col"
  >
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
            :aria-label="t('dms.a11y.loading')"
            v-if="isFirstLoad"
            class="h-[33px] w-36"
          />
          <span
            v-else
            class="transition-opacity"
            :class="isRefreshing && 'opacity-55'"
          >
            {{ formatted }}
          </span>
        </div>
        <!-- The trend line arrives with the data: its row is held meanwhile. -->
        <div
          v-if="isFirstLoad && showDelta"
          class="mt-1.5 flex h-5 items-center gap-2"
          aria-hidden="true"
        >
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            class="h-4 w-14 rounded-full"
          />
          <USkeleton :aria-label="t('dms.a11y.loading')" class="h-3 w-20" />
        </div>
        <div
          v-else-if="hasMeta"
          class="mt-1.5 flex flex-wrap items-center gap-2 transition-opacity"
          :class="isRefreshing && 'opacity-55'"
        >
          <DmsTrendBadge v-if="showTrend" :delta="delta" :invert="invert" />
          <span v-if="previousFormatted" class="text-dimmed text-xs">
            {{ previousFormatted }}
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
          <!-- The token itself, not its resolved value: a server render
            cannot read the theme, and must draw what the browser draws. -->
          <span
            :class="LEGEND_KEY_CLASS"
            class="bg-(--dms-chart-2)"
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
