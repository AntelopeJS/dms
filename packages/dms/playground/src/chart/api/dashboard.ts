import { Controller, Get, Parameter } from "@antelopejs/interface-api";
import {
  type ChartCardPayload,
  type KpiCardPayload,
  type ChartPayload,
  type RangeTuple,
  type RangeChartPayload,
  type BandLinePayload,
  type CircularPayload,
  type TopListPayload,
  type OhlcTuple,
  type CandlestickPayload,
} from "./dashboard-types";
import {
  TOP_PRODUCT_NAMES,
  TOP_PRODUCT_DEFAULT_LIMIT,
  type BuildTopProductItemOptions,
  buildTopProductItem,
} from "./dashboard-top-products";
import {
  clampCount,
  SAMPLE_LABELS,
  deterministicRandom,
  buildSeries,
  resolveSeed,
} from "./dashboard-data";
import { opsHourLabels, latencyPoints } from "./dashboard-latency";
import { DAILY_METRICS, dailyFigures, kpiOf } from "./dashboard-kpis";

const REPLICA_SEED = 47;
const REPLICA_MIN = 1;
const REPLICA_MAX = 4;

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
    return kpiOf(metric, { preset, from, to, comparison });
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
            y: [point.p50, point.p95] satisfies RangeTuple,
          })),
        },
        {
          name: "p95 – p99",
          data: points.map((point) => ({
            x: point.label,
            y: [point.p95, point.p99] satisfies RangeTuple,
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
            y: [point.p50, point.p99] satisfies RangeTuple,
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
        y: [
          toCents(open),
          toCents(high),
          toCents(low),
          toCents(close),
        ] satisfies OhlcTuple,
      };
    });
    return { series: [{ name: "OHLC", data }] };
  }
}
