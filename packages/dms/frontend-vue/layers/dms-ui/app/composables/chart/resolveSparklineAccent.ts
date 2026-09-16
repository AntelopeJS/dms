const POSITIVE_ACCENT = "success";
const NEGATIVE_ACCENT = "error";
const NEUTRAL_ACCENT = "neutral";
const AUTO_ACCENT = "auto";

export type SparklineTrend = "positive" | "negative" | "neutral";

function trendFromDelta(delta: number): SparklineTrend {
  if (delta > 0) return "positive";
  if (delta < 0) return "negative";
  return "neutral";
}

function trendFromSparkline(values: number[]): SparklineTrend {
  if (values.length < 2) return "neutral";
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (last > first) return "positive";
  if (last < first) return "negative";
  return "neutral";
}

const TREND_TO_ACCENT: Record<SparklineTrend, string> = {
  positive: POSITIVE_ACCENT,
  negative: NEGATIVE_ACCENT,
  neutral: NEUTRAL_ACCENT,
};

const INVERTED_TREND: Record<SparklineTrend, SparklineTrend> = {
  positive: "negative",
  negative: "positive",
  neutral: "neutral",
};

interface AutoAccentInput {
  delta: number | null | undefined;
  sparkline: number[];
  invert?: boolean;
}

function detectTrend(input: AutoAccentInput): SparklineTrend {
  if (input.delta !== null && input.delta !== undefined) {
    return trendFromDelta(input.delta);
  }
  return trendFromSparkline(input.sparkline);
}

export function resolveSparklineAccent(
  accent: string,
  input: AutoAccentInput,
): string {
  if (accent !== AUTO_ACCENT) return accent;
  const trend = detectTrend(input);
  const finalTrend = input.invert ? INVERTED_TREND[trend] : trend;
  return TREND_TO_ACCENT[finalTrend];
}
