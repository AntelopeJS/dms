<script setup lang="ts">
import { computed, inject } from "vue";
import { useApexChart } from "../../composables/chart/useApexChart";
import type { MixedSeriesDef } from "../../composables/chart/useApexChart.types";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { useThemeRevision } from "../../composables/chart/useThemeRevision";
import { formatValue } from "../../composables/chart/formatValue";
import { toDonutRecords } from "../../composables/chart/donutRecords";
import {
  CHART_EVENT_NAMES,
  isSegmentChart,
  readPointValue,
  type ChartClickPayload,
} from "../../composables/chart/events";
import type {
  ChartAnnotation,
  ChartAutoYRange,
  ChartCurve,
  ChartResponse,
  ChartSeries,
  ChartType,
  ChartXAxis,
  ChartXAxisFormatter,
  ComparisonStyle,
  DonutRecord,
  NestedChartContext,
} from "../../composables/chart/types";
import {
  CIRCULAR_CHART_TYPES,
  NESTED_CHART_INJECT_KEY,
} from "../../composables/chart/types";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface Props extends DefaultComponentProps {
  type: ChartType;
  title?: string;
  description?: string;
  fetchUrl?: string;
  fetchUrlMethod?: string;
  periodScope?: string;
  realtimeTopic?: string | string[];
  height?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  smooth?: boolean;
  curve?: ChartCurve;
  stacked?: boolean;
  annotations?: ChartAnnotation[];
  autoYRange?: ChartAutoYRange;
  syncGroup?: string;
  color?: string | string[];
  comparisonStyle?: ComparisonStyle;
  staticDataset?: ChartSeries[] | DonutRecord[];
  rawOptions?: Array<{ key: string; value: string }>;
  yRange?: { min: number; max: number };
  strokeWidth?: number;
  fillOpacity?: number;
  barWidth?: number;
  columnWidth?: number;
  roundedCorners?: boolean;
  orientation?: "horizontal" | "vertical";
  centralLabel?: string;
  centralSubLabel?: string;
  arcWidth?: number;
  hollowSize?: string;
  showTotal?: boolean;
  shadeIntensity?: number;
  distributed?: boolean;
  seriesDefs?: MixedSeriesDef[];
  pointSize?: number;
  showLabels?: boolean;
  xaxisType?: "category" | "datetime" | "numeric";
  xAxis?: ChartXAxis;
  /** Runtime only; takes precedence over xAxis.datetimeFormat. */
  xAxisFormatter?: ChartXAxisFormatter;
}

const DEFAULT_CHART_HEIGHT = "320px";

const props = withDefaults(defineProps<Props>(), {
  height: DEFAULT_CHART_HEIGHT,
  showTooltip: true,
  showLegend: true,
  smooth: true,
});

const emit = defineEmits<{
  (event: "segmentClick" | "pointClick", payload: ChartClickPayload): void;
}>();

const nestedContext = inject<NestedChartContext | null>(
  NESTED_CHART_INJECT_KEY,
  null,
);

const { processI18n } = useTranslation();
const { sendComponentEvent } = useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

const watchKey = computed(() => JSON.stringify(watchState.value));
const themeRevision = useThemeRevision();

const isCircular = computed(() => CIRCULAR_CHART_TYPES.includes(props.type));

const staticSeries = computed<ChartSeries[]>(() => {
  if (isCircular.value) return [];
  if (!props.staticDataset) return [];
  return props.staticDataset as ChartSeries[];
});

const staticDonut = computed<DonutRecord[]>(() => {
  if (!isCircular.value) return [];
  if (!props.staticDataset) return [];
  return props.staticDataset as DonutRecord[];
});

const isNested = computed(() => !!nestedContext);

const { data, isLoading } = useChartFetch<ChartResponse>({
  fetchUrl: isNested.value ? undefined : props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  periodScope: props.periodScope,
  realtimeTopic: props.realtimeTopic,
  staticData: null,
  watchSource: () => watchKey.value,
});

const seriesFromCtx = computed<ChartSeries[]>(() => {
  if (!nestedContext) return [];
  return [...nestedContext.cardSeries, ...nestedContext.cardComparisonSeries];
});

const fetchSeries = computed<ChartSeries[]>(() => {
  if (!data.value) return [];
  return data.value.series ?? [];
});

const finalSeries = computed<ChartSeries[]>(() => {
  if (seriesFromCtx.value.length > 0) return seriesFromCtx.value;
  if (fetchSeries.value.length > 0) return fetchSeries.value;
  return staticSeries.value;
});

// A donut plots the first series only; a nested one plots its card's, like
// every other nested chart type.
const finalDonutData = computed<DonutRecord[]>(() => {
  if (!isCircular.value) return [];
  const source = nestedContext ? nestedContext.cardSeries : fetchSeries.value;
  const records = toDonutRecords(source[0]);
  return records.length > 0 ? records : staticDonut.value;
});

function buildCircularClickPayload(opts: {
  dataPointIndex: number;
  seriesIndex: number;
}): ChartClickPayload {
  const record = finalDonutData.value[opts.dataPointIndex];
  return {
    dataPointIndex: opts.dataPointIndex,
    seriesIndex: opts.seriesIndex,
    value: record?.value ?? null,
    seriesName: record?.label ?? "",
    label: record?.label,
  };
}

function buildXyClickPayload(opts: {
  dataPointIndex: number;
  seriesIndex: number;
}): ChartClickPayload {
  const series = finalSeries.value[opts.seriesIndex];
  const point = series?.data[opts.dataPointIndex];
  const pointValue = readPointValue(point);
  const label =
    typeof point === "object" && point !== null && "label" in point
      ? (point as { label?: string }).label
      : undefined;
  return {
    dataPointIndex: opts.dataPointIndex,
    seriesIndex: opts.seriesIndex,
    ...pointValue,
    seriesName: series?.name ?? "",
    label,
  };
}

function emitDataClick(
  _e: unknown,
  _ctx: unknown,
  opts: { dataPointIndex: number; seriesIndex: number },
) {
  const isSegment = isSegmentChart(props.type);
  const payload = isSegment
    ? buildCircularClickPayload(opts)
    : buildXyClickPayload(opts);
  const eventName = isSegment
    ? CHART_EVENT_NAMES.segmentClick
    : CHART_EVENT_NAMES.pointClick;
  emit(isSegment ? "segmentClick" : "pointClick", payload);
  if (props.componentId)
    sendComponentEvent(eventName, props.componentId, payload);
}

const { locale } = useI18n();

const effectiveShowLegend = computed(() => {
  if (nestedContext?.hideLegend) return false;
  return props.showLegend;
});

const yAxisFormatter = computed<((value: number) => string) | undefined>(() => {
  if (!nestedContext?.valueFormat) return undefined;
  const fmt = nestedContext.valueFormat;
  const currency = nestedContext.currencyCode;
  const precision = nestedContext.valuePrecision;
  return (value: number) =>
    formatValue(value, fmt, locale.value, currency, precision);
});

const apex = useApexChart(() => ({
  type: props.type,
  title: props.title,
  height: props.height,
  showGrid: props.showGrid,
  showTooltip: props.showTooltip,
  showLegend: effectiveShowLegend.value,
  smooth: props.smooth,
  curve: props.curve,
  stacked: props.stacked,
  annotations: props.annotations,
  autoYRange: props.autoYRange,
  syncGroup: props.syncGroup,
  chartId: props.componentId,
  comparisonStyle: props.comparisonStyle,
  comparisonSeriesCount: nestedContext?.cardComparisonSeries.length ?? 0,
  series: finalSeries.value,
  donutData: finalDonutData.value,
  colors: props.color,
  rawOptions: props.rawOptions,
  themeRevision: themeRevision.value,
  yRange: props.yRange,
  strokeWidth: props.strokeWidth,
  fillOpacity: props.fillOpacity,
  barWidth: props.barWidth,
  columnWidth: props.columnWidth,
  roundedCorners: props.roundedCorners,
  orientation: props.orientation,
  centralLabel: props.centralLabel,
  centralSubLabel: props.centralSubLabel,
  arcWidth: props.arcWidth,
  hollowSize: props.hollowSize,
  showTotal: props.showTotal,
  shadeIntensity: props.shadeIntensity,
  distributed: props.distributed,
  seriesDefs: props.seriesDefs,
  pointSize: props.pointSize,
  showLabels: props.showLabels,
  xaxisType: props.xaxisType,
  xAxis: props.xAxis,
  xAxisFormatter: props.xAxisFormatter,
  yAxisFormatter: yAxisFormatter.value,
  onDataPointClick: emitDataClick,
}));

const heightInPx = computed(() => props.height);
</script>

<template>
  <!-- Standalone charts get the card frame; charts nested inside a
       DmsChartCard inherit its frame instead. -->
  <div
    class="dms-chart"
    :class="nestedContext ? undefined : 'dms-card p-5 sm:p-6'"
  >
    <div v-if="!nestedContext && (title || description)" class="mb-3">
      <h3 v-if="title" class="text-highlighted text-lg font-semibold">
        {{ processI18n(title) }}
      </h3>
      <p v-if="description" class="text-dimmed text-sm">
        {{ processI18n(description) }}
      </p>
    </div>

    <DmsClientOnly>
      <DmsApexChartHost
        v-if="finalSeries.length > 0 || finalDonutData.length > 0"
        :apex-type="apex.apexType.value"
        :height="heightInPx"
        :options="apex.options.value"
        :series="apex.series.value"
      />
      <div
        v-else-if="isLoading"
        class="bg-elevated/30 flex items-center justify-center rounded-md"
        :style="{ height: heightInPx }"
      >
        <USkeleton class="h-full w-full" />
      </div>
      <div
        v-else
        class="text-dimmed flex items-center justify-center text-sm"
        :style="{ height: heightInPx }"
      >
        {{ $t("dms.chart.no_data") }}
      </div>
      <template #fallback>
        <USkeleton class="w-full" :style="{ height: heightInPx }" />
      </template>
    </DmsClientOnly>
  </div>
</template>
