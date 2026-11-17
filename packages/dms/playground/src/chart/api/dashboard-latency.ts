import { deterministicRandom } from "./dashboard-data";

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

export function opsHourLabels(): string[] {
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

export function latencyPoints(): LatencyPoint[] {
  return opsHourLabels().map((label, index) => ({
    label,
    ...latencyPercentiles(index),
  }));
}
