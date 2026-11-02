import { Controller, Get, Parameter } from "@antelopejs/interface-api";
import {
  chartCardData,
  kpiCardData,
  type SeriesPoint,
} from "@antelopejs/interface-dms/base/query-response";
import { ownEntry } from "../../own-entry";

const CHANNELS = ["Direct", "Email", "Search", "Social"];
const CHANNEL_SESSIONS = [4200, 1800, 6500, 2100];
const HOURS = ["00h", "04h", "08h", "12h", "16h", "20h"];
const LATENCY_AVERAGE = [118, 104, 162, 210, 188, 131];
const LATENCY_P95 = [240, 221, 330, 452, 401, 276];
const SIGNUPS = [12, 18, 9, 22, 15, 30];
const NO_SIGNUP = [0, 0, 0, 0, 0, 0];
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary preset query strings require the existing indexed lookup and fallback.
const PRESET_SCALES: Record<string, number> = {
  "last-month": 0.9,
  "this-quarter": 2.8,
};

function isComparing(comparison: string | undefined): boolean {
  return !!comparison && comparison !== "none";
}

function hourly(values: number[], scale = 1): SeriesPoint[] {
  return HOURS.map((x, index) => ({ x, y: Math.round(values[index] * scale) }));
}

/**
 * Card payloads built with the interface's response helpers
 * (`chartCardData`, `kpiCardData`) instead of by hand.
 */
export class CardsDemoApiController extends Controller("/api/dashboard/cards") {
  @Get("channels")
  getChannels(@Parameter("preset", "query") preset?: string) {
    const scale = ownEntry(PRESET_SCALES, preset ?? "") ?? 1;
    const points = CHANNELS.map((x, index) => ({
      x,
      y: Math.round(CHANNEL_SESSIONS[index] * scale),
    }));
    return chartCardData(points, { measure: "sum", label: "Sessions" });
  }

  @Get("latency")
  getLatency(@Parameter("preset", "query") preset?: string) {
    const scale = ownEntry(PRESET_SCALES, preset ?? "") ?? 1;
    const data = chartCardData(hourly(LATENCY_AVERAGE, scale), {
      measure: "avg",
      label: "Average",
    });
    return {
      ...data,
      series: [
        ...data.series,
        { name: "p95", data: hourly(LATENCY_P95, scale) },
      ],
    };
  }

  @Get("signups")
  getSignups(@Parameter("comparison", "query") comparison?: string) {
    return kpiCardData(hourly(SIGNUPS), {
      measure: "sum",
      previous: isComparing(comparison) ? hourly(NO_SIGNUP) : undefined,
    });
  }
}
