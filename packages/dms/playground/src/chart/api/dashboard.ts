import { Controller, Get, Parameter } from "@antelopejs/interface-api";

const MAX_GENERATED_ITEMS = 500;

// These endpoints size their generated payload from a query parameter and are
// unauthenticated: without a ceiling, `?count=1000000000` allocates until the
// process dies.
function clampCount(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_GENERATED_ITEMS);
}

interface Point {
  x: string;
  y: number;
}

interface ChartCardPayload {
  value: number;
  delta: number;
  previousValue: number;
  series: Array<{ name: string; data: Point[] }>;
  comparisonSeries?: Array<{ name: string; data: Point[] }>;
}

interface KpiCardPayload {
  value: number;
  delta: number;
  previousValue: number;
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
const DAILY_SERIES_LENGTH = 30;

function buildDailySeries(
  name: string,
  seed: number,
  min: number,
  max: number,
  daysOffset = 0,
): NamedSeries {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const data = Array.from({ length: DAILY_SERIES_LENGTH }, (_, index) => {
    const offset = (DAILY_SERIES_LENGTH - 1 - index + daysOffset) * ONE_DAY_MS;
    const date = new Date(today.getTime() - offset);
    return {
      x: date.toISOString().slice(0, 10),
      y: Math.round(min + deterministicRandom(seed, index) * (max - min)),
    };
  });
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

export class DashboardApiController extends Controller("/api/dashboard") {
  private resolveSeed(preset?: string, from?: string): number {
    const presetSeed = PRESET_SEED_OFFSETS[preset ?? "this-month"] ?? 0;
    const dateSeed = from ? hashKey(from) : 0;
    return presetSeed + dateSeed;
  }

  @Get("sales")
  getSales(
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): ChartCardPayload {
    const seed = this.resolveSeed(preset, from);
    const current = buildDailySeries("Période", seed, 5500, 9500);
    const comparisonSeries =
      comparison && comparison !== "none"
        ? [buildDailySeries("Comparaison", seed + 11, 5000, 11000)]
        : undefined;
    const currentTotal = totalOf(current);
    const previousTotal = comparisonSeries
      ? totalOf(comparisonSeries[0])
      : currentTotal;
    return {
      value: currentTotal,
      previousValue: previousTotal,
      delta: deltaPercent(currentTotal, previousTotal),
      series: [current],
      comparisonSeries,
    };
  }

  @Get("kpi/:metric")
  getKpi(
    @Parameter("metric", "param") metric: string,
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
  ): KpiCardPayload {
    const metricSeedMap: Record<string, number> = {
      revenue: 1,
      orders: 2,
      customers: 3,
    };
    const baseSeed = metricSeedMap[metric] ?? 4;
    const seed = baseSeed * 17 + this.resolveSeed(preset, from);
    const sparkline = Array.from({ length: 12 }, (_, index) =>
      Math.round(50 + deterministicRandom(seed, index) * 200),
    );
    const current = sparkline.reduce((acc, value) => acc + value, 0);
    const previous =
      comparison && comparison !== "none"
        ? Math.round(current * (0.8 + deterministicRandom(seed, 99) * 0.4))
        : current;
    return {
      value: current,
      previousValue: previous,
      delta: deltaPercent(current, previous),
      sparkline,
    };
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
    const size = clampCount(sizeParam, 5);
    const labels = ["Direct", "Email", "Search", "Social", "Referral", "Other"];
    const data = labels.slice(0, size).map((label, index) => ({
      x: label,
      y: Math.round(100 + deterministicRandom(42, index) * 900),
      label,
    }));
    return { series: [{ name: "Channels", data }] };
  }

  @Get("top-products")
  getTopProducts(
    @Parameter("limit", "query") limitParam?: string,
    @Parameter("preset", "query") preset?: string,
    @Parameter("from", "query") from?: string,
    @Parameter("comparison", "query") comparison?: string,
    @Parameter("withSparkline", "query") withSparkline?: string,
  ): TopListPayload {
    const seed = this.resolveSeed(preset, from);
    const limit = clampCount(limitParam, TOP_PRODUCT_DEFAULT_LIMIT);
    const options: BuildTopProductItemOptions = {
      includeSparkline: withSparkline === "true",
      includeDelta: !!(comparison && comparison !== "none"),
    };
    const items = TOP_PRODUCT_NAMES.slice(
      0,
      Math.min(limit, TOP_PRODUCT_NAMES.length),
    ).map((name, index) => buildTopProductItem(name, index, seed, options));
    return { items };
  }

  @Get("candlestick")
  getCandlestick(): {
    series: Array<{
      name: string;
      data: Array<{ x: string; y: [number, number, number, number] }>;
    }>;
  } {
    const data = SAMPLE_LABELS.map((label, index) => {
      const open = 100 + deterministicRandom(7, index) * 50;
      const close = open + (deterministicRandom(13, index) - 0.5) * 20;
      const high = Math.max(open, close) + deterministicRandom(19, index) * 10;
      const low = Math.min(open, close) - deterministicRandom(23, index) * 10;
      return {
        x: label,
        y: [open, high, low, close] as [number, number, number, number],
      };
    });
    return { series: [{ name: "OHLC", data }] };
  }
}
