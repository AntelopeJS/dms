<script setup lang="ts">
import { computed, inject, ref, watch } from "vue";
import DmsEmptyState from "../empty-state/EmptyState.vue";
import DmsChartSkeleton from "../../build/components/chart/internal/ChartSkeleton.vue";
import {
  hasDrawablePoints,
  resolveBlockState,
  useBlockStateAttributes,
} from "../../build/composables/blocks/blockDataState";
import {
  chartFrameHeight,
  useApexChart,
} from "../../composables/chart/useApexChart";
import type {
  ApexClickHandler,
  MixedSeriesDef,
} from "../../composables/chart/useApexChart.types";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { useThemeRevision } from "../../composables/chart/useThemeRevision";
import { formatValue } from "../../composables/chart/formatValue";
import { toDonutRecords } from "../../composables/chart/donutRecords";
import {
  localizeDonutRecords,
  localizeSeries,
} from "../../composables/chart/localizeSeries";
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
  ChartLegendPosition,
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
import { responseSeries } from "../../build/composables/chart/groupPoints";

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
  legendPosition?: ChartLegendPosition;
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
const EMPTY_ICON = "i-ph-chart-line-up";

const props = withDefaults(defineProps<Props>(), {
  height: DEFAULT_CHART_HEIGHT,

  showGrid: true,
  roundedCorners: true,
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

function localized(series: ChartSeries[]): ChartSeries[] {
  return series.map((entry) => localizeSeries(entry, processI18n));
}

const staticSeries = computed<ChartSeries[]>(() => {
  if (isCircular.value) return [];
  if (!props.staticDataset) return [];
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The prop permits either dataset independently of chart type. This legacy non-circular handoff assumes series without validating or transforming mismatched datasets.
  return localized(props.staticDataset as ChartSeries[]);
});

const staticDonut = computed<DonutRecord[]>(() => {
  if (!isCircular.value) return [];
  if (!props.staticDataset) return [];
  return localizeDonutRecords(
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The prop permits either dataset independently of chart type. This legacy circular handoff assumes donut records without validating or transforming mismatched datasets.
    props.staticDataset as DonutRecord[],
    processI18n,
  );
});

const isNested = computed(() => !!nestedContext);

const { data, isLoading, error } = useChartFetch<ChartResponse>({
  fetchUrl: isNested.value ? undefined : props.fetchUrl,
  fetchUrlMethod: props.fetchUrlMethod,
  routeParams: () => props.routeParams,
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
  return localized(
    responseSeries(data.value.series ?? [], props.title ?? "", props.xaxisType),
  );
});

const finalSeries = computed<ChartSeries[]>(() => {
  if (seriesFromCtx.value.length > 0) return seriesFromCtx.value;
  if (fetchSeries.value.length > 0) return fetchSeries.value;
  return staticSeries.value;
});

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
  const dataPointIndex = apex.sourcePointIndex(
    opts.seriesIndex,
    opts.dataPointIndex,
  );
  const point = series?.data[dataPointIndex];
  const pointValue = readPointValue(point);
  const label =
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The shared isObject guard widens this owner union's label to unknown; typeof preserves the ChartSeries field without a cast or changed payload validation.
    typeof point === "object" && point !== null && "label" in point
      ? point.label
      : undefined;
  return {
    dataPointIndex,
    seriesIndex: opts.seriesIndex,
    ...pointValue,
    seriesName: series?.name ?? "",
    label,
  };
}

function emitDataClick(
  _e: Parameters<ApexClickHandler>[0],
  _ctx: Parameters<ApexClickHandler>[1],
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
  legendPosition: props.legendPosition,
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
  locale: locale.value,
  onDataPointClick: emitDataClick,
}));

const heightInPx = computed(() => props.height);

const frameHeight = computed(() =>
  chartFrameHeight(props.height, isCircular.value),
);

const hasData = computed(
  () => finalSeries.value.length > 0 || finalDonutData.value.length > 0,
);

const isAwaitingData = computed(() =>
  nestedContext ? nestedContext.isLoading : isLoading.value,
);

const isRefreshing = computed(() => hasData.value && isAwaitingData.value);

const blockAttributes = useBlockStateAttributes("Chart", () =>
  resolveBlockState({
    loading: isAwaitingData.value,
    failed: !nestedContext && Boolean(error.value),
    hasContent: isCircular.value
      ? finalDonutData.value.some((record) => record.value !== 0)
      : hasDrawablePoints(finalSeries.value),
  }),
);

const isDrawn = ref(false);
watch(hasData, (present) => {
  if (!present) isDrawn.value = false;
});
</script>

<template>
  <!-- Standalone charts get the card frame; charts nested inside a
       DmsChartCard inherit its frame instead. -->
  <div
    v-bind="blockAttributes"
    class="dms-chart"
    :class="nestedContext ? undefined : 'dms-card p-3.5 sm:pr-[18px]'"
  >
    <div
      v-if="!nestedContext && (title || description)"
      class="mb-2.5 px-1 pt-0.5"
    >
      <h3
        v-if="title"
        class="text-highlighted text-sm leading-[1.3] font-semibold tracking-[-0.01em]"
      >
        {{ processI18n(title) }}
      </h3>
      <p v-if="description" class="text-dimmed mt-px text-[12.5px]">
        {{ processI18n(description) }}
      </p>
    </div>

    <DmsClientOnly>
      <div
        v-if="hasData"
        class="relative transition-opacity"
        :class="isRefreshing && 'opacity-55'"
        :style="{ minHeight: frameHeight }"
        :aria-busy="isRefreshing || !isDrawn || undefined"
      >
        <DmsApexChartHost
          :class="!isDrawn && 'invisible'"
          :apex-type="apex.apexType.value"
          :height="heightInPx"
          :options="apex.options.value"
          :series="apex.series.value"
          @drawn="isDrawn = true"
        />
        <DmsChartSkeleton
          v-if="!isDrawn"
          class="absolute inset-x-0 top-0"
          :height="frameHeight"
          :circular="isCircular"
        />
      </div>
      <DmsChartSkeleton
        v-else-if="isAwaitingData"
        :height="frameHeight"
        :circular="isCircular"
      />
      <DmsEmptyState
        v-else
        :icon="EMPTY_ICON"
        :title="$t('dms.chart.no_data')"
        size="sm"
        class="border-default place-content-center rounded-lg border border-dashed"
        :style="{ height: frameHeight }"
      />
      <template #fallback>
        <DmsChartSkeleton :height="frameHeight" :circular="isCircular" />
      </template>
    </DmsClientOnly>
  </div>
</template>
