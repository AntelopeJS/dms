import type { ApexOptions } from "apexcharts";
import type { ApexTypeConfig } from "../../../composables/chart/apexTypeConfigs";
import type {
  ChartSeries,
  ChartType,
  ComparisonStyle,
} from "../../../composables/chart/types";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";

const DASHED_DASH_LENGTH = 5;
const DIMMED_OPACITY = 0.4;
const FULL_OPACITY = 1;
const PRIMARY_STROKE_WIDTH = 2.5;
const COMPARISON_STROKE_WIDTH = 1.75;
const AREA_PRIMARY_FROM = 0.26;
const AREA_PRIMARY_TO = 0;
const AREA_COMPARISON_OPACITY = 0.7;
const AREA_GRADIENT_STOPS = [0, 100];
const RADAR_FILL_DEFAULT = 0.4;
const RANGE_AREA_FILL_DEFAULT = 0.28;
const STACKED_SEGMENT_GAP = 1.5;
const STACKED_GAP_TYPES: ChartType[] = ["bar", "column"];

export interface ComparisonContext {
  enabled: boolean;
  startIndex: number;
  totalSeries: number;
}

export function buildComparisonContext(
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

export function applyComparisonStyle(
  context: ComparisonContext,
  style: ComparisonStyle | undefined,
) {
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

const FILL_BUILDERS: Partial<
  Record<
    ChartType,
    (
      props: UseApexChartInput,
      comparison: ComparisonContext,
    ) => NonNullable<ApexOptions["fill"]>
  >
> = {
  area: (props, comparison) => buildAreaFill(props, comparison),
  radar: (props) => ({ opacity: props.fillOpacity ?? RADAR_FILL_DEFAULT }),
  rangeArea: (props) => ({
    opacity: props.fillOpacity ?? RANGE_AREA_FILL_DEFAULT,
  }),
};

/** Only the main series fades; the comparison's solid fill sets stroke opacity. */
function buildAreaFill(
  props: UseApexChartInput,
  comparison: ComparisonContext,
): NonNullable<ApexOptions["fill"]> {
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

export function buildFill(
  input: UseApexChartInput,
  comparison: ComparisonContext,
): NonNullable<ApexOptions["fill"]> | null {
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

export function buildStroke(
  input: UseApexChartInput,
  config: ApexTypeConfig,
  comparisonDashArray: number[] | undefined,
  comparison: ComparisonContext,
  surface: string,
): NonNullable<ApexOptions["stroke"]> {
  const initialStroke = { ...config.defaultStroke };
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The public configuration accepts arbitrary curve strings; inference and ApexStroke reject that existing unchecked Apex boundary.
  const stroke = initialStroke as NonNullable<ApexOptions["stroke"]>;
  if (input.smooth === false && stroke.curve) stroke.curve = "straight";
  if (input.curve) stroke.curve = input.curve;
  stroke.width = buildStrokeWidths(input, comparison, initialStroke.width);
  stroke.lineCap = "round";
  if (comparisonDashArray) stroke.dashArray = comparisonDashArray;
  applySegmentGap(stroke, input, config, surface);
  return stroke;
}

/** Separates donut slices and stacked segments with a card-coloured stroke. */
function applySegmentGap(
  stroke: NonNullable<ApexOptions["stroke"]>,
  input: UseApexChartInput,
  config: ApexTypeConfig,
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

export function applySeriesStroke(
  options: { stroke: NonNullable<ApexOptions["stroke"]> },
  series: ChartSeries[],
): void {
  const stroke = options.stroke;
  const properties = {
    strokeWidth: "width",
    strokeDashArray: "dashArray",
  } as const;
  const seriesProperties: Array<keyof typeof properties> = [
    "strokeWidth",
    "strokeDashArray",
  ];
  for (const property of seriesProperties) {
    if (!series.some((entry) => entry[property] !== undefined)) continue;
    const key = properties[property];
    const fallback = stroke[key];
    stroke[key] = series.map(
      (entry, index) =>
        entry[property] ??
        (Array.isArray(fallback) ? fallback[index] : fallback) ??
        0,
    );
  }
}

export function applyFillWithComparison(
  baseOptions: ApexOptions,
  fill: NonNullable<ApexOptions["fill"]> | null,
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
