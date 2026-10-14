import { APEX_TYPE_CONFIGS } from "./apexTypeConfigs";
import type { ChartSeries } from "./types";
import type { UseApexChartInput } from "./useApexChart.types";

const DEFAULT_Y_RANGE_PADDING = 0.08;
const ZERO_BOUND_MAGNITUDE = 1;
const STEP_DIVISIONS = 10;
const NICE_STEP_FACTORS = [1, 2, 5, 10];
const DECIMAL_BASE = 10;
/** Enough digits to keep every real value while dropping binary float noise. */
const SIGNIFICANT_DIGITS = 12;

const DOWNWARD = -1;
const UPWARD = 1;

type Rounding = (value: number) => number;

/** Bounds Apex resolves from the extent it measured on the drawn series. */
interface AutoYBounds {
  min?: (nativeMin: number) => number;
  max?: (nativeMax: number) => number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function withoutFloatNoise(value: number): number {
  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}

function pointValues(point: ChartSeries["data"][number]): unknown[] {
  if (typeof point === "number") return [point];
  if (!point || typeof point !== "object") return [];
  return Array.isArray(point.y) ? point.y : [point.y];
}

function seriesValues(series: ChartSeries[]): number[] {
  return series.flatMap((entry) =>
    entry.data.flatMap(pointValues).filter(isFiniteNumber),
  );
}

function annotationValues(input: UseApexChartInput): number[] {
  return (input.annotations ?? [])
    .flatMap((annotation) => [annotation.y, annotation.y2])
    .filter(isFiniteNumber);
}

function resolvePadding(input: UseApexChartInput): number {
  const requested = input.autoYRange?.padding ?? DEFAULT_Y_RANGE_PADDING;
  return Number.isFinite(requested) && requested >= 0
    ? requested
    : DEFAULT_Y_RANGE_PADDING;
}

function padOutward(bound: number, padding: number, direction: number): number {
  return bound + direction * (Math.abs(bound) || ZERO_BOUND_MAGNITUDE) * padding;
}

/** The smallest 1, 2 or 5 times a power of ten that covers `span`. */
export function niceStep(span: number): number {
  const magnitude = DECIMAL_BASE ** Math.floor(Math.log10(span));
  const factor =
    NICE_STEP_FACTORS.find((candidate) => candidate * magnitude >= span) ??
    DECIMAL_BASE;
  return withoutFloatNoise(factor * magnitude);
}

function snapToStep(value: number, step: number, round: Rounding): number {
  return withoutFloatNoise(round(withoutFloatNoise(value / step)) * step);
}

/**
 * The tick step for the padded extent of what is known up front: the series
 * and the annotations. Apex only lays round ticks between bounds that are
 * multiples of a round step; padded raw bounds give 603.6, 437.2…
 */
function estimateStep(values: number[], padding: number): number | undefined {
  if (values.length === 0) return undefined;
  const lower = padOutward(Math.min(...values), padding, DOWNWARD);
  const upper = padOutward(Math.max(...values), padding, UPWARD);
  const span = upper - lower;
  return span > 0 ? niceStep(span / STEP_DIVISIONS) : undefined;
}

function stepForBound(bound: number, knownStep: number | undefined): number {
  if (knownStep !== undefined) return knownStep;
  return niceStep((Math.abs(bound) || ZERO_BOUND_MAGNITUDE) / STEP_DIVISIONS);
}

/**
 * Y bounds that take in the annotations, padded outward and rounded to a round
 * step so the axis ticks read 100, 200… rather than the raw padded extent.
 */
export function buildAutoYRange(input: UseApexChartInput): AutoYBounds {
  if (!input.autoYRange || APEX_TYPE_CONFIGS[input.type].isCircular) return {};
  const padding = resolvePadding(input);
  const annotations = annotationValues(input);
  const knownStep = estimateStep(
    [...seriesValues(input.series), ...annotations],
    padding,
  );
  const bound = (native: number, direction: number, round: Rounding) => {
    const extent = [native, ...annotations];
    const raw = direction === DOWNWARD ? Math.min(...extent) : Math.max(...extent);
    const padded = padOutward(raw, padding, direction);
    return snapToStep(padded, stepForBound(padded, knownStep), round);
  };
  return {
    min: (nativeMin) => bound(nativeMin, DOWNWARD, Math.floor),
    max: (nativeMax) => bound(nativeMax, UPWARD, Math.ceil),
  };
}

/**
 * Axis labels without a format of their own. Apex writes them with as many
 * decimals as the most precise data point, so 160 reads "160.00000000000000"
 * once one price carries float noise.
 */
export function formatPlainAxisValue(value: number): string {
  return isFiniteNumber(value) ? String(withoutFloatNoise(value)) : String(value);
}
