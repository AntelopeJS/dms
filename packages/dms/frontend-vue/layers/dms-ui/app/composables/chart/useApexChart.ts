import { computed } from "vue";
import type { ApexOptions } from "apexcharts";
import {
  injectRawOptions,
  type RawOptionSection,
} from "../../build/composables/chart/apexRawOptions";
import {
  applyComparisonStyle,
  applyFillWithComparison,
  applySeriesStroke,
  buildComparisonContext,
  buildFill,
  buildStroke,
  type ComparisonContext,
} from "../../build/composables/chart/apexSeriesStyle";
import { APEX_TYPE_CONFIGS } from "./apexTypeConfigs";
import { buildAnnotations } from "./apexAnnotations";
import { buildPlotOptions, ringFitsSliceLabels } from "./apexPlotOptions";
import { buildXAxis, buildYAxis } from "../../build/composables/chart/apexAxes";
import {
  applyHeatmapThemeMode,
  applyValueBasedColorScale,
} from "../../build/composables/chart/apexHeatmap";
import {
  bucketAxisFormatter,
  bucketTooltipFormatter,
  detectDatetimeBuckets,
  toBucketSeries,
  type DatetimeBuckets,
} from "./apexDatetimeBuckets";
import { isReducedMotionActive } from "../../build/utils/accessibilityPreferences";
import {
  buildDataLabels,
  dataLabelOffset,
  buildGrid,
  buildLegend,
  buildMarkers,
  buildTooltip,
  readApexThemeColors,
} from "../../build/composables/chart/apexTheme";
import {
  resolveChartColor,
  resolveChartColors,
  readThemeMuted,
} from "./useChartTheme";
import type { ChartSeries, ChartType, DonutRecord } from "./types";
import type {
  MixedSeriesDef,
  UseApexChartInput,
  UseApexChartOutput,
} from "./useApexChart.types";

const DEFAULT_HEIGHT = 320;
const ANIMATION_SPEED_MS = 300;
const HEIGHT_NUMBER_REGEX = /[^0-9]/g;
const COMPARISON_LINE_TYPE = "line";
const LINE_LEAD_TYPES: ChartType[] = ["line", "area"];

function parseHeight(height?: string): number {
  if (!height) return DEFAULT_HEIGHT;
  const numeric = Number.parseInt(height.replace(HEIGHT_NUMBER_REGEX, ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_HEIGHT;
}

/**
 * Blank band Apex keeps under an axis chart (`chart.parentHeightOffset`, its
 * own default): the drawn chart stands this much taller than its `height`.
 * Circular charts get no band.
 */
export const AXIS_CHART_BOTTOM_OFFSET = 15;

/**
 * Height of the box a drawn chart occupies, as a CSS length: what a chart
 * reserves from the first paint, so its skeleton and the drawn chart line up.
 */
export function chartFrameHeight(
  height: string | undefined,
  circular: boolean,
): string {
  const offset = circular ? 0 : AXIS_CHART_BOTTOM_OFFSET;
  return `${parseHeight(height) + offset}px`;
}

interface CircularLabels {
  series: number[];
  labels: string[];
}

function buildCircularLabels(
  records: DonutRecord[] | undefined,
): CircularLabels {
  const safeRecords = records ?? [];
  return {
    series: safeRecords.map((entry) => entry.value),
    labels: safeRecords.map((entry) => entry.label),
  };
}

function resolveSeriesColors(
  series: ChartSeries[],
  fallback: string[],
): string[] {
  if (series.length === 0) return fallback;
  return series.map((entry, index) => {
    if (entry.color) return entry.color;
    return fallback[index % fallback.length] ?? fallback[0]!;
  });
}

const DISTRIBUTED_PALETTE_TYPES: ChartType[] = ["heatmap"];

function isDistributedPaletteType(input: UseApexChartInput): boolean {
  if (DISTRIBUTED_PALETTE_TYPES.includes(input.type) && input.distributed) {
    return true;
  }
  return false;
}

function applyMixedSeriesDefs(
  series: ChartSeries[],
  seriesDefs: MixedSeriesDef[] | undefined,
): ChartSeries[] {
  if (!seriesDefs || seriesDefs.length === 0) return series;
  return series.map((entry, index) => {
    const def = seriesDefs[index] ?? seriesDefs[seriesDefs.length - 1];
    if (!def) return entry;
    return {
      ...entry,
      type: def.type ?? entry.type,
      color: entry.color ?? def.color,
      name: entry.name || def.name,
    };
  });
}

const RANGE_AREA_APEX_TYPE = "rangeArea";

function resolveApexType(
  input: UseApexChartInput,
): NonNullable<NonNullable<ApexOptions["chart"]>["type"]> {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The public configuration accepts arbitrary chart strings; inference and ApexOptions reject that existing unchecked Apex boundary.
  const baseType = APEX_TYPE_CONFIGS[input.type].apexType as NonNullable<
    NonNullable<ApexOptions["chart"]>["type"]
  >;
  if (input.type !== "mixed") return baseType;
  const hasRangeBand = input.seriesDefs?.some(
    (def) => def.type === RANGE_AREA_APEX_TYPE,
  );
  return hasRangeBand ? RANGE_AREA_APEX_TYPE : baseType;
}

function applySyncGroup(
  chartConfig: NonNullable<ApexOptions["chart"]>,
  input: UseApexChartInput,
): void {
  if (!input.syncGroup) return;
  chartConfig.group = input.syncGroup;
  if (input.chartId) chartConfig.id = input.chartId;
}

function buildChartConfig(
  input: UseApexChartInput,
  muted: string,
): NonNullable<ApexOptions["chart"]> {
  const heightPx = parseHeight(input.height);
  const chartConfig: NonNullable<ApexOptions["chart"]> = {
    type: resolveApexType(input),
    height: heightPx,
    parentHeightOffset: AXIS_CHART_BOTTOM_OFFSET,
    toolbar: { show: false },
    zoom: { enabled: false },
    stacked: input.stacked ?? false,

    animations: {
      enabled: !isReducedMotionActive(),
      speed: ANIMATION_SPEED_MS,
    },
    fontFamily: "inherit",
    background: "transparent",
    foreColor: muted,
  };
  if (input.onDataPointClick) {
    chartConfig.events = { dataPointSelection: input.onDataPointClick };
  }
  applySyncGroup(chartConfig, input);
  return chartConfig;
}

function buildBaseOptions(
  input: UseApexChartInput,
  config: (typeof APEX_TYPE_CONFIGS)[ChartType],
  seriesColors: string[],
  comparisonDashArray: number[] | undefined,
  comparison: ComparisonContext,
) {
  const theme = readApexThemeColors(readThemeMuted());
  return {
    chart: buildChartConfig(input, theme.muted),
    colors: seriesColors,
    dataLabels: buildDataLabels(
      (config.supportsDataLabels || input.showLabels === true) &&
        ringFitsSliceLabels(input),
      theme,
      config.isCircular,
      dataLabelOffset(input),
    ),
    stroke: buildStroke(
      input,
      config,
      comparisonDashArray,
      comparison,
      theme.surface,
    ),
    legend: buildLegend(input, config.isCircular, theme),
    tooltip: buildTooltip(input, config),
    grid: buildGrid(input, config.isCircular, theme),
    xaxis: buildXAxis(input, theme),
    yaxis: buildYAxis(input, theme),
    markers: buildMarkers(input, input.series, seriesColors, theme),
  };
}

function applyOptionalSections(
  baseOptions: ApexOptions,
  input: UseApexChartInput,
  isCircular: boolean,
  series: ChartSeries[],
  palette: string[],
): void {
  const plotOptions = buildPlotOptions(input);
  applyValueBasedColorScale(plotOptions, input, series, palette);
  applyHeatmapThemeMode(baseOptions, input);
  if (Object.keys(plotOptions).length > 0)
    baseOptions.plotOptions = plotOptions;

  const annotations = buildAnnotations(input.annotations);
  if (annotations) baseOptions.annotations = annotations;

  if (isCircular) {
    baseOptions.labels = buildCircularLabels(input.donutData).labels;
  }
}

function projectSeries(
  input: UseApexChartInput,
  isCircular: boolean,
  buckets: DatetimeBuckets | null,
): ChartSeries[] {
  if (isCircular) return [];
  void input.themeRevision;
  const mixed =
    input.type === "mixed"
      ? applyMixedSeriesDefs(input.series, input.seriesDefs)
      : input.series;
  const series = buckets ? toBucketSeries(mixed, buckets) : mixed;
  return asComparisonLines(series, input).map((entry) =>
    entry.color ? { ...entry, color: resolveChartColor(entry.color) } : entry,
  );
}

/**
 * Calendar buckets on a datetime axis become one category each: a column
 * per month (or day), evenly spaced, under one label, the tooltip naming the
 * whole bucket.
 */
function applyDatetimeBuckets(
  options: ReturnType<typeof buildBaseOptions>,
  input: UseApexChartInput,
  buckets: DatetimeBuckets | null,
): void {
  if (!buckets) return;
  const xaxis = options.xaxis;
  const { format: _datetimeFormat, ...labels } = xaxis.labels;
  options.xaxis = {
    ...xaxis,
    type: "category",
    labels: { ...labels, formatter: bucketAxisFormatter(buckets, input) },
  };
  const tooltip = options.tooltip;
  options.tooltip = {
    ...tooltip,
    x: {
      // SAFETY: The public formatter stringifies its input before reading it, so Apex's numeric input follows the same conversion without widening the public callback contract.
      formatter: bucketTooltipFormatter(buckets, input) as ReturnType<
        typeof bucketTooltipFormatter
      > &
        NonNullable<
          NonNullable<NonNullable<ApexOptions["tooltip"]>["x"]>["formatter"]
        >,
    },
  };
}

/**
 * On an area chart the comparison is drawn as a bare line (v2): Apex takes a
 * fill's opacity from an rgba colour over any fill setting, so an unfilled
 * series is the only reliable way to keep the comparison from being painted.
 */
function asComparisonLines(
  series: ChartSeries[],
  input: UseApexChartInput,
): ChartSeries[] {
  const comparison = buildComparisonContext(
    series.length,
    input.comparisonSeriesCount,
    false,
  );
  if (input.type !== "area" || !comparison.enabled) return series;
  return series.map((entry, index) =>
    index >= comparison.startIndex
      ? { ...entry, type: entry.type ?? COMPARISON_LINE_TYPE }
      : entry,
  );
}

function resolveSeriesColorPalette(
  value: UseApexChartInput,
  cfg: (typeof APEX_TYPE_CONFIGS)[ChartType],
  series: ChartSeries[],
  baseColors: string[],
): string[] {
  const usesPaletteDirectly = cfg.isCircular || isDistributedPaletteType(value);
  if (usesPaletteDirectly) return baseColors;
  return resolveSeriesColors(series, baseColors);
}

/**
 * Lines lead with the sparkline tone, deeper than the bright fill used by
 * bars, so a thin stroke keeps its contrast on white.
 */
function withLineLead(value: UseApexChartInput, palette: string[]): string[] {
  if (value.colors !== undefined || !LINE_LEAD_TYPES.includes(value.type)) {
    return palette;
  }
  return [resolveChartColor("--dms-sparkline"), ...palette.slice(1)];
}

interface ChartOptionsContext {
  baseColors: string[];
  seriesColors: string[];
  comparison: ReturnType<typeof buildComparisonContext>;
  comparisonStyling: ReturnType<typeof applyComparisonStyle> | undefined;
}

function buildChartOptionsContext(
  value: UseApexChartInput,
  cfg: (typeof APEX_TYPE_CONFIGS)[ChartType],
  finalSeries: ChartSeries[],
): ChartOptionsContext {
  const baseColors = withLineLead(value, resolveChartColors(value.colors));
  const seriesColors = resolveSeriesColorPalette(
    value,
    cfg,
    finalSeries,
    baseColors,
  );
  const comparison = buildComparisonContext(
    finalSeries.length,
    value.comparisonSeriesCount,
    cfg.isCircular,
  );
  const comparisonStyling = comparison.enabled
    ? applyComparisonStyle(comparison, value.comparisonStyle)
    : undefined;

  return { baseColors, seriesColors, comparison, comparisonStyling };
}

function buildChartOptions(
  value: UseApexChartInput,
  cfg: (typeof APEX_TYPE_CONFIGS)[ChartType],
  finalSeries: ChartSeries[],
  buckets: DatetimeBuckets | null,
): RawOptionSection {
  void value.themeRevision;
  const ctx = buildChartOptionsContext(value, cfg, finalSeries);

  const baseOptions = buildBaseOptions(
    value,
    cfg,
    ctx.seriesColors,
    ctx.comparisonStyling?.dashArray,
    ctx.comparison,
  );
  applySeriesStroke(baseOptions, finalSeries);
  applyFillWithComparison(
    baseOptions,
    buildFill(value, ctx.comparison),
    ctx.comparisonStyling,
    value.comparisonStyle,
  );
  applyOptionalSections(
    baseOptions,
    value,
    cfg.isCircular,
    finalSeries,
    ctx.baseColors,
  );
  applyDatetimeBuckets(baseOptions, value, buckets);
  return injectRawOptions(baseOptions, value.rawOptions);
}

export function useApexChart(
  input: () => UseApexChartInput,
): UseApexChartOutput {
  const config = computed(() => APEX_TYPE_CONFIGS[input().type]);
  const buckets = computed(() => detectDatetimeBuckets(input()));
  const finalSeries = computed<ChartSeries[]>(() =>
    projectSeries(input(), config.value.isCircular, buckets.value),
  );

  const series = computed(() => {
    const value = input();
    if (config.value.isCircular) {
      return buildCircularLabels(value.donutData).series;
    }
    return finalSeries.value;
  });

  const options = computed(() =>
    buildChartOptions(input(), config.value, finalSeries.value, buckets.value),
  );

  const apexType = computed(() => resolveApexType(input()));
  const sourcePointIndex = (seriesIndex: number, dataPointIndex: number) =>
    buckets.value?.sourceIndexes[seriesIndex]?.[dataPointIndex] ??
    dataPointIndex;
  return { apexType, options, series, sourcePointIndex };
}
