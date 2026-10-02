import { computed } from "vue";
import { APEX_TYPE_CONFIGS } from "./apexTypeConfigs";
import { buildAnnotations } from "./apexAnnotations";
import { buildPlotOptions } from "./apexPlotOptions";
import { isReducedMotionActive } from "../../utils/accessibilityPreferences";
import {
  axisLabelStyle,
  buildDataLabels,
  buildGrid,
  buildLegend,
  buildMarkers,
  buildTooltip,
  readApexThemeColors,
  type ApexThemeColors,
} from "./apexTheme";
import {
  resolveChartColor,
  resolveChartColors,
  readThemeBorderAccented,
  readThemeHighlighted,
  readThemeMuted,
} from "./useChartTheme";
import type {
  ChartSeries,
  ChartType,
  ComparisonStyle,
  DonutRecord,
} from "./types";
import type {
  MixedSeriesDef,
  UseApexChartInput,
  UseApexChartOutput,
} from "./useApexChart.types";

const DEFAULT_HEIGHT = 320;
const DASHED_DASH_LENGTH = 5;
const DIMMED_OPACITY = 0.4;
const FULL_OPACITY = 1;
const PRIMARY_STROKE_WIDTH = 2.5;
const COMPARISON_STROKE_WIDTH = 1.75;
const AREA_PRIMARY_FROM = 0.26;
const AREA_PRIMARY_TO = 0;
// The comparison line of an area chart takes its stroke opacity from the
// fill (it is a line series, see asComparisonLines): v2 draws it at 70%.
const AREA_COMPARISON_OPACITY = 0.7;
const AREA_GRADIENT_STOPS = [0, 100];
const RADAR_FILL_DEFAULT = 0.4;
const RANGE_AREA_FILL_DEFAULT = 0.28;
const ANIMATION_SPEED_MS = 300;
const HEIGHT_NUMBER_REGEX = /[^0-9]/g;
const CROSSHAIR_DASH = 3;
const STACKED_SEGMENT_GAP = 1.5;
const COMPARISON_LINE_TYPE = "line";
const LINE_LEAD_TYPES: ChartType[] = ["line", "area"];
const STACKED_GAP_TYPES: ChartType[] = ["bar", "column"];

function parseHeight(height?: string): number {
  if (!height) return DEFAULT_HEIGHT;
  const numeric = Number.parseInt(height.replace(HEIGHT_NUMBER_REGEX, ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_HEIGHT;
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

interface ComparisonContext {
  enabled: boolean;
  startIndex: number;
  totalSeries: number;
}

function buildComparisonContext(
  totalSeries: number,
  comparisonCount: number | undefined,
  isCircular: boolean,
): ComparisonContext {
  if (isCircular || !comparisonCount || comparisonCount <= 0) {
    return { enabled: false, startIndex: totalSeries, totalSeries };
  }
  const safeCount = Math.min(comparisonCount, totalSeries);
  return {
    enabled: safeCount > 0 && safeCount < totalSeries,
    startIndex: totalSeries - safeCount,
    totalSeries,
  };
}

interface ComparisonStyleResult {
  dashArray: number[];
  opacities: number[];
}

function applyComparisonStyle(
  context: ComparisonContext,
  style: ComparisonStyle | undefined,
): ComparisonStyleResult {
  const styleValue = style ?? "dashed";
  return {
    dashArray: Array.from({ length: context.totalSeries }, (_, index) =>
      index >= context.startIndex && styleValue === "dashed"
        ? DASHED_DASH_LENGTH
        : 0,
    ),
    opacities: Array.from({ length: context.totalSeries }, (_, index) =>
      index >= context.startIndex && styleValue === "dimmed"
        ? DIMMED_OPACITY
        : FULL_OPACITY,
    ),
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

const FILL_BUILDERS: Partial<
  Record<
    ChartType,
    (
      props: UseApexChartInput,
      comparison: ComparisonContext,
    ) => Record<string, unknown>
  >
> = {
  area: (props, comparison) => buildAreaFill(props, comparison),
  radar: (props) => ({ opacity: props.fillOpacity ?? RADAR_FILL_DEFAULT }),
  rangeArea: (props) => ({
    opacity: props.fillOpacity ?? RANGE_AREA_FILL_DEFAULT,
  }),
};

/**
 * Only the main series gets the fading area; the comparison is a line series
 * whose solid "fill" sets its stroke opacity.
 */
function buildAreaFill(
  props: UseApexChartInput,
  comparison: ComparisonContext,
): Record<string, unknown> {
  const gradient = {
    shadeIntensity: 1,
    type: "vertical",
    opacityFrom: props.fillOpacity ?? AREA_PRIMARY_FROM,
    opacityTo: AREA_PRIMARY_TO,
    stops: AREA_GRADIENT_STOPS,
  };
  if (!comparison.enabled) return { type: "gradient", gradient };
  const isComparison = (index: number) => index >= comparison.startIndex;
  return {
    type: Array.from({ length: comparison.totalSeries }, (_, index) =>
      isComparison(index) ? "solid" : "gradient",
    ),
    opacity: Array.from({ length: comparison.totalSeries }, (_, index) =>
      isComparison(index) ? AREA_COMPARISON_OPACITY : FULL_OPACITY,
    ),
    gradient,
  };
}

function buildFill(
  input: UseApexChartInput,
  comparison: ComparisonContext,
): Record<string, unknown> | null {
  return FILL_BUILDERS[input.type]?.(input, comparison) ?? null;
}

function buildStrokeWidths(
  input: UseApexChartInput,
  comparison: ComparisonContext,
  defaultWidth: number | undefined,
): number | number[] {
  if (input.strokeWidth !== undefined) return input.strokeWidth;
  if (!comparison.enabled) return defaultWidth ?? PRIMARY_STROKE_WIDTH;
  const primaryWidth = defaultWidth ?? PRIMARY_STROKE_WIDTH;
  return Array.from({ length: comparison.totalSeries }, (_, index) =>
    index >= comparison.startIndex ? COMPARISON_STROKE_WIDTH : primaryWidth,
  );
}

function buildStroke(
  input: UseApexChartInput,
  config: (typeof APEX_TYPE_CONFIGS)[ChartType],
  comparisonDashArray: number[] | undefined,
  comparison: ComparisonContext,
  surface: string,
): Record<string, unknown> {
  const stroke: Record<string, unknown> = { ...config.defaultStroke };
  if (input.smooth === false && stroke.curve) stroke.curve = "straight";
  if (input.curve) stroke.curve = input.curve;
  stroke.width = buildStrokeWidths(input, comparison, stroke.width as number);
  stroke.lineCap = "round";
  if (comparisonDashArray) stroke.dashArray = comparisonDashArray;
  applySegmentGap(stroke, input, config, surface);
  return stroke;
}

/**
 * Donut slices and stacked segments are separated by a card-coloured stroke,
 * which reads as a gap in both themes (Apex defaults it to white).
 */
function applySegmentGap(
  stroke: Record<string, unknown>,
  input: UseApexChartInput,
  config: (typeof APEX_TYPE_CONFIGS)[ChartType],
  surface: string,
): void {
  const isStackedBar =
    !!input.stacked && STACKED_GAP_TYPES.includes(input.type);
  if (!config.isCircular && !isStackedBar) return;
  stroke.colors = [surface];
  if (isStackedBar && input.strokeWidth === undefined) {
    stroke.width = STACKED_SEGMENT_GAP;
  }
}

function applySeriesStroke(
  options: Record<string, unknown>,
  series: ChartSeries[],
): void {
  const stroke = options.stroke as Record<string, unknown>;
  const properties = {
    strokeWidth: "width",
    strokeDashArray: "dashArray",
  } as const;
  for (const property of Object.keys(properties) as Array<
    keyof typeof properties
  >) {
    if (!series.some((entry) => entry[property] !== undefined)) continue;
    const key = properties[property];
    const fallback = stroke[key] as number | number[] | undefined;
    stroke[key] = series.map(
      (entry, index) =>
        entry[property] ??
        (Array.isArray(fallback) ? fallback[index] : fallback) ??
        0,
    );
  }
}

const HIGH_CONTRAST_YAXIS_TYPES: ChartType[] = ["radar"];

const DEFAULT_Y_RANGE_PADDING = 0.08;
const ZERO_BOUND_MAGNITUDE = 1;

function buildAutoYRange(input: UseApexChartInput): Record<string, unknown> {
  if (!input.autoYRange || APEX_TYPE_CONFIGS[input.type].isCircular) return {};
  const requested = input.autoYRange.padding ?? DEFAULT_Y_RANGE_PADDING;
  const padding =
    Number.isFinite(requested) && requested >= 0
      ? requested
      : DEFAULT_Y_RANGE_PADDING;
  const bounds = (input.annotations ?? [])
    .flatMap((annotation) => [annotation.y, annotation.y2])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const lower = bounds.reduce((min, value) => Math.min(min, value), Infinity);
  const upper = bounds.reduce((max, value) => Math.max(max, value), -Infinity);
  return {
    min: (nativeMin: number) => {
      const min = Math.min(nativeMin, lower);
      return min - (Math.abs(min) || ZERO_BOUND_MAGNITUDE) * padding;
    },
    max: (nativeMax: number) => {
      const max = Math.max(nativeMax, upper);
      return max + (Math.abs(max) || ZERO_BOUND_MAGNITUDE) * padding;
    },
  };
}

function buildYAxis(
  input: UseApexChartInput,
  theme: ApexThemeColors,
): Record<string, unknown> {
  const labelColor = HIGH_CONTRAST_YAXIS_TYPES.includes(input.type)
    ? readThemeHighlighted()
    : theme.dimmed;
  const yaxis: Record<string, unknown> = {
    ...buildAutoYRange(input),
    labels: { style: axisLabelStyle(labelColor, theme) },
  };
  if (input.yRange) {
    yaxis.min = input.yRange.min;
    yaxis.max = input.yRange.max;
  }
  if (input.yAxisFormatter) {
    (yaxis.labels as Record<string, unknown>).formatter = input.yAxisFormatter;
  }
  return yaxis;
}

function buildXAxis(
  input: UseApexChartInput,
  theme: ApexThemeColors,
): Record<string, unknown> {
  const settings = input.xAxis;
  const xaxis: Record<string, unknown> = {
    type: input.xaxisType ?? "category",
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
    labels: {
      style: axisLabelStyle(theme.dimmed, theme),
      datetimeUTC: false,
      // Labels that no longer fit (a phone, a narrow card) are thinned out
      // instead of being rotated into an unreadable pile; an explicit
      // setting still wins.
      rotate: settings?.rotate ?? 0,
      hideOverlappingLabels: settings?.hideOverlappingLabels ?? true,
      ...(input.xaxisType === "datetime" &&
      settings?.datetimeFormat !== undefined
        ? { format: settings.datetimeFormat }
        : {}),
      ...(input.xAxisFormatter ? { formatter: input.xAxisFormatter } : {}),
    },
    crosshairs: {
      stroke: { color: readThemeBorderAccented(), dashArray: CROSSHAIR_DASH },
    },
  };
  if (settings?.tickAmount !== undefined)
    xaxis.tickAmount = settings.tickAmount;
  return xaxis;
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

function injectRawOptions(
  options: Record<string, unknown>,
  rawOptions: Array<{ key: string; value: string }> | undefined,
): Record<string, unknown> {
  if (!rawOptions || rawOptions.length === 0) return options;
  const merged: Record<string, unknown> = { ...options };
  for (const entry of rawOptions) {
    try {
      merged[entry.key] = JSON.parse(entry.value);
    } catch {
      merged[entry.key] = entry.value;
    }
  }
  return merged;
}

const RANGE_AREA_APEX_TYPE = "rangeArea";

function resolveApexType(input: UseApexChartInput): string {
  const baseType = APEX_TYPE_CONFIGS[input.type].apexType;
  if (input.type !== "mixed") return baseType;
  const hasRangeBand = input.seriesDefs?.some(
    (def) => def.type === RANGE_AREA_APEX_TYPE,
  );
  return hasRangeBand ? RANGE_AREA_APEX_TYPE : baseType;
}

function applySyncGroup(
  chartConfig: Record<string, unknown>,
  input: UseApexChartInput,
): void {
  if (!input.syncGroup) return;
  chartConfig.group = input.syncGroup;
  if (input.chartId) chartConfig.id = input.chartId;
}

function buildChartConfig(
  input: UseApexChartInput,
  muted: string,
): Record<string, unknown> {
  const heightPx = parseHeight(input.height);
  const chartConfig: Record<string, unknown> = {
    type: resolveApexType(input),
    height: heightPx,
    toolbar: { show: false },
    zoom: { enabled: false },
    stacked: input.stacked ?? false,
    // Reduced motion (Appearance setting or system) draws the chart at once.
    // A change of the setting toggles an <html> class, which bumps the theme
    // revision and so rebuilds these options.
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
): Record<string, unknown> {
  const theme = readApexThemeColors(readThemeMuted());
  return {
    chart: buildChartConfig(input, theme.muted),
    colors: seriesColors,
    dataLabels: buildDataLabels(
      config.supportsDataLabels || input.showLabels === true,
      theme,
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

function applyFillWithComparison(
  baseOptions: Record<string, unknown>,
  fill: Record<string, unknown> | null,
  comparisonStyling: { opacities: number[] } | undefined,
  comparisonStyle: ComparisonStyle | undefined,
): void {
  const isDimmed = comparisonStyling && comparisonStyle === "dimmed";
  if (fill) {
    baseOptions.fill = isDimmed
      ? { ...fill, opacity: comparisonStyling.opacities }
      : fill;
    return;
  }
  if (isDimmed) baseOptions.fill = { opacity: comparisonStyling.opacities };
}

const VALUE_SCALED_TYPES: ChartType[] = ["heatmap"];
const VALUE_SCALED_PLOT_KEY: Record<string, string> = {
  heatmap: "heatmap",
};

function extractNumericValues(series: ChartSeries[]): number[] {
  const values: number[] = [];
  for (const entry of series) {
    for (const point of entry.data) {
      if (typeof point === "number") {
        values.push(point);
        continue;
      }
      if (point && typeof point === "object" && "y" in point) {
        const y = (point as { y: unknown }).y;
        if (typeof y === "number") values.push(y);
      }
    }
  }
  return values;
}

interface ColorScaleRange {
  from: number;
  to: number;
  name: string;
  color: string;
}

function formatRangeBound(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildValueBasedRanges(
  values: number[],
  palette: string[],
): ColorScaleRange[] {
  if (values.length === 0 || palette.length === 0) return [];
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  if (min === max) {
    return [
      {
        from: min,
        to: max,
        name: formatRangeBound(min),
        color: palette[palette.length - 1]!,
      },
    ];
  }
  const step = (max - min) / palette.length;
  return palette.map((color, index) => {
    const from = Math.round(min + step * index);
    const to =
      index === palette.length - 1 ? max : Math.round(min + step * (index + 1));
    return {
      from,
      to,
      name: `${formatRangeBound(from)} – ${formatRangeBound(to)}`,
      color,
    };
  });
}

function applyValueBasedColorScale(
  plotOptions: Record<string, unknown>,
  input: UseApexChartInput,
  series: ChartSeries[],
  palette: string[],
): void {
  if (!VALUE_SCALED_TYPES.includes(input.type)) return;
  if (input.distributed) return;
  if (palette.length < 2) return;
  const ranges = buildValueBasedRanges(extractNumericValues(series), palette);
  if (ranges.length === 0) return;
  const subKey = VALUE_SCALED_PLOT_KEY[input.type]!;
  const subOptions =
    (plotOptions[subKey] as Record<string, unknown> | undefined) ?? {};
  subOptions.colorScale = { ranges };
  plotOptions[subKey] = subOptions;
}

function applyOptionalSections(
  baseOptions: Record<string, unknown>,
  input: UseApexChartInput,
  isCircular: boolean,
  series: ChartSeries[],
  palette: string[],
): void {
  const plotOptions = buildPlotOptions(input);
  applyValueBasedColorScale(plotOptions, input, series, palette);
  if (Object.keys(plotOptions).length > 0)
    baseOptions.plotOptions = plotOptions;

  const annotations = buildAnnotations(input.annotations);
  if (annotations) baseOptions.annotations = annotations;

  if (isCircular) {
    baseOptions.labels = buildCircularLabels(input.donutData).labels;
  }

  if (input.type === "scatter" && input.pointSize !== undefined) {
    baseOptions.markers = { size: input.pointSize };
  }
}

function projectSeries(
  input: UseApexChartInput,
  isCircular: boolean,
): ChartSeries[] {
  if (isCircular) return [];
  void input.themeRevision;
  const series =
    input.type === "mixed"
      ? applyMixedSeriesDefs(input.series, input.seriesDefs)
      : input.series;
  return asComparisonLines(series, input).map((entry) =>
    entry.color ? { ...entry, color: resolveChartColor(entry.color) } : entry,
  );
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
): Record<string, unknown> {
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
  return injectRawOptions(baseOptions, value.rawOptions);
}

export function useApexChart(
  input: () => UseApexChartInput,
): UseApexChartOutput {
  const config = computed(() => APEX_TYPE_CONFIGS[input().type]);
  const finalSeries = computed<ChartSeries[]>(() =>
    projectSeries(input(), config.value.isCircular),
  );

  const series = computed<unknown>(() => {
    const value = input();
    if (config.value.isCircular) {
      return buildCircularLabels(value.donutData).series;
    }
    return finalSeries.value;
  });

  const options = computed<Record<string, unknown>>(() =>
    buildChartOptions(input(), config.value, finalSeries.value),
  );

  const apexType = computed(() => resolveApexType(input()));
  return { apexType, options, series };
}
