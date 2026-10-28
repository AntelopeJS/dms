import { Controller, Get, Parameter } from "@antelopejs/interface-api";

const MAX_GENERATED_ITEMS = 500;

function clampCount(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_GENERATED_ITEMS);
}

interface Point {
  x: string;
  y: number;
}

/**
 * A figure and, only while a comparison period is selected, the one before it
 * and the share it moved: without one the card shows no change at all, not a
 * 0% stand-in (see `ComparedFigure` in interface-dms).
 */
interface ComparedPayload {
  delta?: number;
  previousValue?: number;
}

interface ChartCardPayload extends ComparedPayload {
  value: number;
  series: Array<{ name: string; data: Point[] }>;
  comparisonSeries?: Array<{ name: string; data: Point[] }>;
}

interface KpiCardPayload extends ComparedPayload {
  value: number;
  sparkline: number[];
}

interface ChartPayload {
  series: Array<{ name: string; data: Point[] }>;
}

type RangeTuple = [number, number];

interface RangePoint {
  x: string;
  y: RangeTuple;
}

interface RangeChartPayload {
  series: Array<{ name: string; data: RangePoint[] }>;
}

interface BandLinePayload {
  series: Array<{ name: string; data: RangePoint[] | Point[] }>;
}

interface CircularPayload {
  series: Array<{
    name: string;
    data: Array<{ x: string; y: number; label: string }>;
  }>;
}

interface TopListItemPayload {
  id: string;
  title: string;
  description?: string;
  value: number;
  delta?: number | null;
  sparkline?: number[];
}

interface TopListPayload {
  items: TopListItemPayload[];
}

const TOP_PRODUCT_NAMES = [
  "Station météo Aurelia",
  "Hub USB-C Meteor",
  "Enceinte BT Cosmos",
  "Ampoule connectée Solis",
  "Cafetière automatique Nova",
  "Classeur à tiroirs Atlas",
  "Lampe LED Nova",
  "Souris sans fil Vega",
  "Blender Titan Pro",
  "Tapis de sol Vulcan",
  "Volant gaming Storm",
  "Trottinette électrique Gust",
  "Montre connectée Orion",
  "Casque audio Helix",
  "Clavier mécanique Quartz",
  "Webcam UltraHD Lyra",
  "Disque externe Vortex",
  "Routeur mesh Nimbus",
  "Imprimante 3D Hyperion",
  "Drone caméra Spectra",
  "Console de jeu Aether",
  "Aspirateur robot Pulsar",
  "Ventilateur tour Zephyr",
  "Friteuse à air Solara",
  "Sac à dos Nomade",
];

const TOP_PRODUCT_CATEGORIES = [
  "Domotique",
  "Accessoire",
  "Audio",
  "Domotique",
  "Électroménager",
  "Mobilier",
  "Éclairage",
  "Périphérique",
  "Électroménager",
  "Accessoire",
  "Gaming",
  "Mobilité",
  "Wearable",
  "Audio",
  "Périphérique",
  "Périphérique",
  "Stockage",
  "Réseau",
  "Impression",
  "Drone",
  "Gaming",
  "Domotique",
  "Électroménager",
  "Drone",
  "Accessoire",
];

const TOP_PRODUCT_SPARKLINE_LENGTH = 12;
const TOP_PRODUCT_UNKNOWN_CATEGORY = "Divers";
const TOP_PRODUCT_DEFAULT_LIMIT = 10;
const TOP_PRODUCT_BASE_MIN = 800;
const TOP_PRODUCT_BASE_RANGE = 9500;
const TOP_PRODUCT_SPARK_MIN = 50;
const TOP_PRODUCT_SPARK_RANGE = 200;
const TOP_PRODUCT_DELTA_OFFSET = 0.3;
const TOP_PRODUCT_DELTA_AMPLITUDE = 200;
const TOP_PRODUCT_DELTA_PRECISION = 10;
const TOP_PRODUCT_SKU_BASE = 10000;
const TOP_PRODUCT_SEED_STEP = 13;
const TOP_PRODUCT_DELTA_SEED_INDEX = 99;

interface BuildTopProductItemOptions {
  includeSparkline: boolean;
  includeDelta: boolean;
}

function buildTopProductSparkline(itemSeed: number): number[] {
  return Array.from({ length: TOP_PRODUCT_SPARKLINE_LENGTH }, (_, sparkIndex) =>
    Math.round(
      TOP_PRODUCT_SPARK_MIN +
        deterministicRandom(itemSeed, sparkIndex) * TOP_PRODUCT_SPARK_RANGE,
    ),
  );
}

function buildTopProductDelta(itemSeed: number): number {
  const raw =
    (deterministicRandom(itemSeed, TOP_PRODUCT_DELTA_SEED_INDEX) -
      TOP_PRODUCT_DELTA_OFFSET) *
    TOP_PRODUCT_DELTA_AMPLITUDE;
  return (
    Math.round(raw * TOP_PRODUCT_DELTA_PRECISION) / TOP_PRODUCT_DELTA_PRECISION
  );
}

function buildTopProductItem(
  name: string,
  index: number,
  seed: number,
  options: BuildTopProductItemOptions,
): TopListItemPayload {
  const itemSeed = seed + index * TOP_PRODUCT_SEED_STEP;
  const baseValue =
    TOP_PRODUCT_BASE_MIN +
    deterministicRandom(itemSeed, 0) * TOP_PRODUCT_BASE_RANGE;
  const category =
    TOP_PRODUCT_CATEGORIES[index] ?? TOP_PRODUCT_UNKNOWN_CATEGORY;
  return {
    id: `prod-${index + 1}`,
    title: name,
    description: `${category} · SKU-${TOP_PRODUCT_SKU_BASE + index}`,
    value: Math.round(baseValue),
    sparkline: options.includeSparkline
      ? buildTopProductSparkline(itemSeed)
      : undefined,
    delta: options.includeDelta ? buildTopProductDelta(itemSeed) : null,
  };
}

const SAMPLE_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const PRESET_SEED_OFFSETS: Record<string, number> = {
  "this-month": 0,
  "last-month": 100,
  "this-quarter": 200,
  "last-quarter": 300,
  ytd: 400,
  "last-year": 500,
  "last-7-days": 600,
  "last-30-days": 700,
  custom: 800,
  "last-hour": 900,
  "last-24h": 1000,
  "last-90-days": 1100,
};

function hashKey(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function deterministicRandom(seed: number, index: number): number {
  const value = Math.sin(seed * 9301 + index * 49297) * 233280;
  return value - Math.floor(value);
}

interface NamedSeries {
  name: string;
  data: Point[];
}

function buildSeries(
  name: string,
  size: number,
  seed: number,
  min: number,
  max: number,
): NamedSeries {
  const labels = SAMPLE_LABELS.slice(0, size);
  const data = labels.map((label, index) => ({
    x: label,
    y: Math.round(min + deterministicRandom(seed, index) * (max - min)),
  }));
  return { name, data };
}

const ONE_DAY_MS = 86400000;
const HALF_DAY_MS = ONE_DAY_MS / 2;
const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 366;
const ISO_DATE_LENGTH = 10;

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, ISO_DATE_LENGTH);
}

function dayTime(value: string | undefined, shift: number): number | undefined {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return undefined;
  return Date.parse(isoDate(time + shift));
}

/**
 * The calendar days of the selected period, up to today: a period still
 * running ("this month") stops at today, and no period means the last 30 days.
 */
function periodDays(from?: string, to?: string): string[] {
  const today = Date.parse(isoDate(Date.now()));
  const end = Math.min(dayTime(to, -HALF_DAY_MS) ?? today, today);
  const start =
    dayTime(from, HALF_DAY_MS) ?? end - (DEFAULT_PERIOD_DAYS - 1) * ONE_DAY_MS;
  const length = Math.round((end - start) / ONE_DAY_MS) + 1;
  const count = Math.min(Math.max(length, 1), MAX_PERIOD_DAYS);
  return Array.from({ length: count }, (_, index) =>
    isoDate(start + index * ONE_DAY_MS),
  );
}

interface ValueRange {
  min: number;
  max: number;
}

function buildDailySeries(
  name: string,
  seed: number,
  range: ValueRange,
  days: string[],
): NamedSeries {
  const data = days.map((x, index) => ({
    x,
    y: Math.round(
      range.min + deterministicRandom(seed, index) * (range.max - range.min),
    ),
  }));
  return { name, data };
}

const OPS_POINT_COUNT = 24;
const HOURS_PER_DAY = 24;
const HOUR_LABEL_LENGTH = 2;
const HOUR_LABEL_PAD = "0";
const HOUR_LABEL_SUFFIX = ":00";
const LATENCY_SEED = 31;
const LATENCY_P50_MIN = 16;
const LATENCY_P50_RANGE = 12;
const LATENCY_P95_MULTIPLIER = 2.4;
const LATENCY_P99_MULTIPLIER = 1.7;
const REPLICA_SEED = 47;
const REPLICA_MIN = 1;
const REPLICA_MAX = 4;

function opsHourLabels(): string[] {
  const currentHour = new Date().getHours();
  return Array.from({ length: OPS_POINT_COUNT }, (_, index) => {
    const offset = OPS_POINT_COUNT - 1 - index;
    const hour = (currentHour - offset + HOURS_PER_DAY) % HOURS_PER_DAY;
    return `${String(hour).padStart(HOUR_LABEL_LENGTH, HOUR_LABEL_PAD)}${HOUR_LABEL_SUFFIX}`;
  });
}

interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

interface LatencyPoint extends LatencyPercentiles {
  label: string;
}

function latencyPercentiles(index: number): LatencyPercentiles {
  const p50 =
    LATENCY_P50_MIN +
    deterministicRandom(LATENCY_SEED, index) * LATENCY_P50_RANGE;
  const p95 =
    p50 *
    (LATENCY_P95_MULTIPLIER + deterministicRandom(LATENCY_SEED + 1, index));
  const p99 =
    p95 *
    (LATENCY_P99_MULTIPLIER + deterministicRandom(LATENCY_SEED + 2, index));
  return {
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
  };
}

function latencyPoints(): LatencyPoint[] {
  return opsHourLabels().map((label, index) => ({
    label,
    ...latencyPercentiles(index),
  }));
}

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

function resolveSeed(preset?: string, from?: string): number {
  const presetSeed = PRESET_SEED_OFFSETS[preset ?? "this-month"] ?? 0;
  const dateSeed = from ? hashKey(from) : 0;
  return presetSeed + dateSeed;
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
const DAILY_METRICS: Record<string, DailyMetric> = {
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
};

function dailyFigures(
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

type KpiBuilder = (period: PeriodRequest) => KpiCardPayload;

const KPI_BUILDERS: Record<string, KpiBuilder> = {
  latency: latencyKpi,
  ...Object.fromEntries(
    Object.entries(DAILY_METRICS).map(([key, metric]) => [
      key,
      (period: PeriodRequest) => dailyKpi(metric, period),
    ]),
  ),
};

const CHANNEL_LABELS = [
  "Direct",
  "Email",
  "Search",
  "Social",
  "Referral",
  "Other",
];
const CHANNEL_SEED = 42;
const CHANNEL_SESSIONS_MIN = 100;
const CHANNEL_SESSIONS_RANGE = 900;
const GOAL_PERCENT_MIN = 35;
const GOAL_PERCENT_RANGE = 60;

type OhlcTuple = [number, number, number, number];

interface CandlePoint {
  x: string;
  y: OhlcTuple;
}

interface CandlestickPayload {
  series: Array<{ name: string; data: CandlePoint[] }>;
}

const CENTS = 100;

function toCents(price: number): number {
  return Math.round(price * CENTS) / CENTS;
}

export class DashboardApiController extends Controller("/api/dashboard") {
  @Get("sales")
  getSales(
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("to", "query") to?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): ChartCardPayload {
    return dailyFigures(DAILY_METRICS.revenue, {
      preset,
      from,
      to,
      comparison,
    });
  }

  @Get("traffic")
  getTraffic(
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("to", "query") to?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): ChartCardPayload {
    return dailyFigures(DAILY_METRICS.sessions, {
      preset,
      from,
      to,
      comparison,
    });
  }

  @Get("kpi/:metric")
  getKpi(
    @Parameter("metric", "param") metric: string,
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("to", "query") to?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): KpiCardPayload {
    const build = KPI_BUILDERS[metric] ?? KPI_BUILDERS.revenue;
    return build({ preset, from, to, comparison });
  }

  @Get("series")
  getSeries(
    @Parameter("seed", "query") seedParam?: string,
    @Parameter("size", "query") sizeParam?: string,
    @Parameter("count", "query") countParam?: string,
  ): ChartPayload {
    const seed = parseInt(seedParam || "1", 10);
    const size = clampCount(sizeParam, 12);
    const count = clampCount(countParam, 1);
    const series = Array.from({ length: count }, (_, index) =>
      buildSeries(`Series ${index + 1}`, size, seed + index * 7, 100, 800),
    );
    return { series };
  }

  @Get("latency")
  getLatency(): RangeChartPayload {
    const points = latencyPoints();
    return {
      series: [
        {
          name: "p50 – p95",
          data: points.map((point) => ({
            x: point.label,
            y: [point.p50, point.p95] as RangeTuple,
          })),
        },
        {
          name: "p95 – p99",
          data: points.map((point) => ({
            x: point.label,
            y: [point.p95, point.p99] as RangeTuple,
          })),
        },
      ],
    };
  }

  @Get("latency-band-line")
  getLatencyBandLine(): BandLinePayload {
    const points = latencyPoints();
    return {
      series: [
        {
          name: "p50 – p99",
          data: points.map((point) => ({
            x: point.label,
            y: [point.p50, point.p99] as RangeTuple,
          })),
        },
        {
          name: "p95",
          data: points.map((point) => ({ x: point.label, y: point.p95 })),
        },
      ],
    };
  }

  @Get("replicas")
  getReplicas(): ChartPayload {
    const spread = REPLICA_MAX - REPLICA_MIN;
    const data = opsHourLabels().map((label, index) => ({
      x: label,
      y:
        REPLICA_MIN +
        Math.round(deterministicRandom(REPLICA_SEED, index) * spread),
    }));
    return { series: [{ name: "replicas", data }] };
  }

  @Get("circular")
  getCircular(@Parameter("size", "query") sizeParam?: string): CircularPayload {
    const size = clampCount(sizeParam, CHANNEL_LABELS.length);
    const data = CHANNEL_LABELS.slice(0, size).map((label, index) => ({
      x: label,
      y: Math.round(
        CHANNEL_SESSIONS_MIN +
          deterministicRandom(CHANNEL_SEED, index) * CHANNEL_SESSIONS_RANGE,
      ),
      label,
    }));
    return { series: [{ name: "Channels", data }] };
  }

  /** Shares of a goal, 0 to 100: what a radial bar reads as percentages. */
  @Get("goals")
  getGoals(@Parameter("size", "query") sizeParam?: string): CircularPayload {
    const size = clampCount(sizeParam, CHANNEL_LABELS.length);
    const data = CHANNEL_LABELS.slice(0, size).map((label, index) => ({
      x: label,
      y: Math.round(
        GOAL_PERCENT_MIN +
          deterministicRandom(CHANNEL_SEED, index) * GOAL_PERCENT_RANGE,
      ),
      label,
    }));
    return { series: [{ name: "Goal reached", data }] };
  }

  @Get("top-products")
  getTopProducts(
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
    @Parameter("withSparkline", "query") withSparkline?: string,
  ): TopListPayload {
    const seed = resolveSeed(preset, from);
    const limit = clampCount(limitParam, TOP_PRODUCT_DEFAULT_LIMIT);
    const options: BuildTopProductItemOptions = {
      includeSparkline: withSparkline === "true",
      includeDelta: !!(comparison && comparison !== "none"),
    };
    const items = TOP_PRODUCT_NAMES.slice(
      0,
      Math.min(limit, TOP_PRODUCT_NAMES.length),
    )
      .map((name, index) => buildTopProductItem(name, index, seed, options))
      .sort((left, right) => right.value - left.value);
    return { items };
  }

  @Get("candlestick")
  getCandlestick(): CandlestickPayload {
    const data = SAMPLE_LABELS.map((label, index) => {
      const open = 100 + deterministicRandom(7, index) * 50;
      const close = open + (deterministicRandom(13, index) - 0.5) * 20;
      const high = Math.max(open, close) + deterministicRandom(19, index) * 10;
      const low = Math.min(open, close) - deterministicRandom(23, index) * 10;
      return {
        x: label,
        y: [open, high, low, close].map(toCents) as OhlcTuple,
      };
    });
    return { series: [{ name: "OHLC", data }] };
  }
}
