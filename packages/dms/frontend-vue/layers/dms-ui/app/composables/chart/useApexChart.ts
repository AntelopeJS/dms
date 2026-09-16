import { computed } from "vue";
import { APEX_TYPE_CONFIGS } from "./apexTypeConfigs";
import { buildAnnotations } from "./apexAnnotations";
import { buildPlotOptions } from "./apexPlotOptions";
import {
  resolveChartColor,
  resolveChartColors,
  readThemeBorder,
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
const DASHED_DASH_LENGTH = 4;
const DIMMED_OPACITY = 0.4;
const FULL_OPACITY = 1;
const PRIMARY_STROKE_WIDTH = 2.5;
const COMPARISON_STROKE_WIDTH = 1.5;
const AREA_PRIMARY_FROM = 0.32;
const AREA_PRIMARY_TO = 0.02;
const AREA_COMPARISON_FROM = 0.08;
const AREA_COMPARISON_TO = 0;
const AREA_GRADIENT_STOPS = [0, 90, 100];
const RADAR_FILL_DEFAULT = 0.4;
const RANGE_AREA_FILL_DEFAULT = 0.28;
const ANIMATION_SPEED_MS = 300;
const GRID_DASH = 4;
const GRID_PADDING = { left: 8, right: 8, top: 0, bottom: 0 };
const AXIS_LABEL_FONT_SIZE = "11px";
const HEIGHT_NUMBER_REGEX = /[^0-9]/g;
const TOOLTIP_DATETIME_FORMAT = "dd MMM yyyy";
const HOVER_MARKER_SIZE = 5;
const CROSSHAIR_DASH = 3;

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

function buildAreaFill(
  props: UseApexChartInput,
  comparison: ComparisonContext,
): Record<string, unknown> {
  const primaryFrom = props.fillOpacity ?? AREA_PRIMARY_FROM;
  if (!comparison.enabled) {
    return {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        type: "vertical",
        opacityFrom: primaryFrom,
        opacityTo: AREA_PRIMARY_TO,
        stops: AREA_GRADIENT_STOPS,
      },
    };
  }
  return {
    type: "gradient",
    gradient: {
      shadeIntensity: 1,
      type: "vertical",
      opacityFrom: Array.from({ length: comparison.totalSeries }, (_, index) =>
        index >= comparison.startIndex ? AREA_COMPARISON_FROM : primaryFrom,
      ),
      opacityTo: Array.from({ length: comparison.totalSeries }, (_, index) =>
        index >= comparison.startIndex ? AREA_COMPARISON_TO : AREA_PRIMARY_TO,
      ),
      stops: AREA_GRADIENT_STOPS,
    },
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
): Record<string, unknown> {
  const stroke: Record<string, unknown> = { ...config.defaultStroke };
  if (input.smooth === false && stroke.curve) stroke.curve = "straight";
  if (input.curve) stroke.curve = input.curve;
  stroke.width = buildStrokeWidths(input, comparison, stroke.width as number);
  stroke.lineCap = "round";
  if (comparisonDashArray) stroke.dashArray = comparisonDashArray;
  return stroke;
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
  muted: string,
): Record<string, unknown> {
  const labelColor = HIGH_CONTRAST_YAXIS_TYPES.includes(input.type)
    ? readThemeHighlighted()
    : muted;
  const yaxis: Record<string, unknown> = {
    ...buildAutoYRange(input),
    labels: {
      style: { colors: labelColor, fontSize: AXIS_LABEL_FONT_SIZE },
    },
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
  muted: string,
): Record<string, unknown> {
  const settings = input.xAxis;
  const xaxis: Record<string, unknown> = {
    type: input.xaxisType ?? "category",
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: { colors: muted, fontSize: AXIS_LABEL_FONT_SIZE },
      datetimeUTC: false,
      ...(settings?.rotate !== undefined ? { rotate: settings.rotate } : {}),
      ...(settings?.hideOverlappingLabels !== undefined
        ? { hideOverlappingLabels: settings.hideOverlappingLabels }
        : {}),
      ...(input.xaxisType === "datetime" &&
      settings?.datetimeFormat !== undefined
        ? { format: settings.datetimeFormat }
        : {}),
      ...(input.xAxisFormatter ? { formatter: input.xAxisFormatter } : {}),
    },
    crosshairs: {
      stroke: { color: muted, dashArray: CROSSHAIR_DASH },
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
    animations: { enabled: true, speed: ANIMATION_SPEED_MS },
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

function buildLegend(
  input: UseApexChartInput,
  isCircular: boolean,
  muted: string,
): Record<string, unknown> {
  return {
    show: input.showLegend ?? true,
    position: isCircular ? "bottom" : "top",
    horizontalAlign: "right",
    labels: { colors: muted },
  };
}

function buildGrid(
  input: UseApexChartInput,
  isCircular: boolean,
  border: string,
): Record<string, unknown> {
  return {
    show: !isCircular && (input.showGrid ?? true),
    borderColor: border,
    strokeDashArray: GRID_DASH,
    padding: GRID_PADDING,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
  };
}

function buildTooltip(
  input: UseApexChartInput,
  config: (typeof APEX_TYPE_CONFIGS)[ChartType],
): Record<string, unknown> {
  const tooltip: Record<string, unknown> = {
    enabled: input.showTooltip ?? true,
    theme: "dark",
    shared: config.sharedTooltip,
    intersect: !config.sharedTooltip,
    marker: { show: true },
  };
  if (input.xaxisType === "datetime") {
    tooltip.x = { format: TOOLTIP_DATETIME_FORMAT };
  }
  if (input.yAxisFormatter) {
    tooltip.y = { formatter: input.yAxisFormatter };
  }
  return tooltip;
}

function buildBaseOptions(
  input: UseApexChartInput,
  config: (typeof APEX_TYPE_CONFIGS)[ChartType],
  seriesColors: string[],
  comparisonDashArray: number[] | undefined,
  comparison: ComparisonContext,
): Record<string, unknown> {
  const muted = readThemeMuted();
  const border = readThemeBorder();
  return {
    chart: buildChartConfig(input, muted),
    colors: seriesColors,
    dataLabels: {
      enabled: config.supportsDataLabels || input.showLabels === true,
    },
    stroke: buildStroke(input, config, comparisonDashArray, comparison),
    legend: buildLegend(input, config.isCircular, muted),
    tooltip: buildTooltip(input, config),
    grid: buildGrid(input, config.isCircular, border),
    xaxis: buildXAxis(input, muted),
    yaxis: buildYAxis(input, muted),
    markers: { size: 0, strokeWidth: 0, hover: { size: HOVER_MARKER_SIZE } },
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
  return series.map((entry) =>
    entry.color ? { ...entry, color: resolveChartColor(entry.color) } : entry,
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
  const baseColors = resolveChartColors(value.colors);
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
