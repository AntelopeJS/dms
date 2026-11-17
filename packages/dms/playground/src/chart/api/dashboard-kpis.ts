import { ownEntry } from "../../own-entry";
import {
  type Point,
  type ComparedPayload,
  type ChartCardPayload,
  type KpiCardPayload,
} from "./dashboard-types";
import { hashKey, deterministicRandom, resolveSeed } from "./dashboard-data";
import {
  periodDays,
  type ValueRange,
  buildDailySeries,
} from "./dashboard-periods";
import { latencyPoints } from "./dashboard-latency";

interface SeriesPoints {
  data: Point[];
}

function totalOf(series: SeriesPoints): number {
  return series.data.reduce((acc, point) => acc + point.y, 0);
}

function deltaPercent(current: number, previous: number): number {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function isComparing(comparison: string | undefined): boolean {
  return !!comparison && comparison !== "none";
}

/** The previous figure and the change, or nothing when not comparing. */
function comparedTo(current: number, previous?: number): ComparedPayload {
  if (previous === undefined) return {};
  return { previousValue: previous, delta: deltaPercent(current, previous) };
}

interface PeriodRequest {
  preset?: string;
  from?: string;
  to?: string;
  comparison?: string;
}

interface DailyMetric {
  seedOffset: number;
  range: ValueRange;
  comparisonRange: ValueRange;
}

const COMPARISON_SEED_OFFSET = 11;

/**
 * The daily figures the period-bound cards read: a KpiCard and a ChartCard
 * naming the same metric total the same days, so they show the same figure.
 */
export const DAILY_METRICS = {
  revenue: {
    seedOffset: 0,
    range: { min: 5500, max: 9500 },
    comparisonRange: { min: 5000, max: 11000 },
  },
  orders: {
    seedOffset: 34,
    range: { min: 60, max: 110 },
    comparisonRange: { min: 50, max: 120 },
  },
  customers: {
    seedOffset: 51,
    range: { min: 8, max: 30 },
    comparisonRange: { min: 6, max: 32 },
  },
  sessions: {
    seedOffset: 68,
    range: { min: 1800, max: 3200 },
    comparisonRange: { min: 1600, max: 3400 },
  },
} satisfies Record<string, DailyMetric>;

export function dailyFigures(
  metric: DailyMetric,
  period: PeriodRequest,
): ChartCardPayload {
  const seed = resolveSeed(period.preset, period.from) + metric.seedOffset;
  const days = periodDays(period.from, period.to);
  const current = buildDailySeries("Period", seed, metric.range, days);
  const comparisonSeries = isComparing(period.comparison)
    ? [
        buildDailySeries(
          "Comparison",
          seed + COMPARISON_SEED_OFFSET,
          metric.comparisonRange,
          days,
        ),
      ]
    : undefined;
  const currentTotal = totalOf(current);
  return {
    value: currentTotal,
    ...comparedTo(
      currentTotal,
      comparisonSeries ? totalOf(comparisonSeries[0]) : undefined,
    ),
    series: [current],
    comparisonSeries,
  };
}

function dailyKpi(metric: DailyMetric, period: PeriodRequest): KpiCardPayload {
  const figures = dailyFigures(metric, period);
  return {
    value: figures.value,
    delta: figures.delta,
    previousValue: figures.previousValue,
    sparkline: figures.series[0].data.map((point) => point.y),
  };
}

const LATENCY_PREVIOUS_SEED = 57;
const LATENCY_PREVIOUS_MIN_RATIO = 0.85;
const LATENCY_PREVIOUS_RATIO_RANGE = 0.3;

/** The average p95 of the latency charts, in milliseconds. */
function latencyKpi(period: PeriodRequest): KpiCardPayload {
  const sparkline = latencyPoints().map((point) => point.p95);
  const current = Math.round(
    sparkline.reduce((acc, value) => acc + value, 0) / sparkline.length,
  );
  const ratio =
    LATENCY_PREVIOUS_MIN_RATIO +
    deterministicRandom(LATENCY_PREVIOUS_SEED, hashKey(period.preset ?? "")) *
      LATENCY_PREVIOUS_RATIO_RANGE;
  const previous = isComparing(period.comparison)
    ? Math.round(current * ratio)
    : undefined;
  return { value: current, ...comparedTo(current, previous), sparkline };
}

/** The KPI of a metric: latency, a daily metric, or revenue for an unknown one. */
export function kpiOf(metric: string, period: PeriodRequest): KpiCardPayload {
  if (metric === "latency") return latencyKpi(period);
  return dailyKpi(
    ownEntry(DAILY_METRICS, metric) ?? DAILY_METRICS.revenue,
    period,
  );
}
