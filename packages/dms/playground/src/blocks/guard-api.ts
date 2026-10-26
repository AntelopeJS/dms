import { Controller, Get, Parameter, Post } from "@antelopejs/interface-api";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { notFound } from "./demo-errors";

/** Published on each test call, which the Guard demo follows. */
export const GUARD_DEMO_TOPIC = "blocks:guard-demo";
const GUARD_EVENT_TYPE = "calls.update";
const DEMO_LATENCY_MS = 600;
const QUIET_PRESET = "last-hour";
const SERIES_LENGTH = 12;
const SERIES_STEP = 7;

// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary preset query strings require the existing indexed lookup and fallback.
const CALLS_BY_PRESET: Record<string, number> = {
  "last-24h": 48,
  "last-7-days": 312,
};

const EXISTING_RECORD = "r1";

let callsThisHour = 0;

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

function callsIn(preset: string | undefined): number {
  if (!preset || preset === QUIET_PRESET) return callsThisHour;
  return CALLS_BY_PRESET[preset] ?? 0;
}

function callSeries(total: number): number[] {
  return Array.from({ length: SERIES_LENGTH }, (_, index) =>
    Math.max(
      0,
      Math.round(total / SERIES_LENGTH + ((index * SERIES_STEP) % 5) - 2),
    ),
  );
}

/**
 * Routes of the Guard demo: a call counter that is empty over the last hour
 * until a test call is sent, and a record that exists (`r1`) or is gone.
 */
export class BlocksGuardApiController extends Controller("/api/blocks/guard") {
  @Get("calls")
  getCalls(@Parameter("preset", "query") preset?: string) {
    const calls = callsIn(preset);
    const emptyState = calls
      ? undefined
      : { description: "No call reached this route in the selected period." };
    return later({ summary: { calls }, emptyState });
  }

  @Get("calls/kpi")
  getCallsKpi(@Parameter("preset", "query") preset?: string) {
    const calls = callsIn(preset);
    return later({ value: calls, sparkline: callSeries(calls) });
  }

  @Get("calls/series")
  getCallsSeries(@Parameter("preset", "query") preset?: string) {
    const data = callSeries(callsIn(preset)).map((y, index) => ({
      x: `t${index + 1}`,
      y,
    }));
    return later({ series: [{ name: "Calls", data }] });
  }

  @Post("calls/send")
  async sendCall() {
    callsThisHour += 1;
    await PublishMessage(GUARD_DEMO_TOPIC, GUARD_EVENT_TYPE);
    return { calls: callsThisHour };
  }

  @Post("calls/reset")
  async resetCalls() {
    callsThisHour = 0;
    await PublishMessage(GUARD_DEMO_TOPIC, GUARD_EVENT_TYPE);
    return { calls: callsThisHour };
  }

  @Get("alerts")
  getAlerts() {
    return later([]);
  }

  @Get("records/:id")
  async getRecord(@Parameter("id", "param") id: string) {
    if (id !== EXISTING_RECORD) {
      await later(null);
      throw notFound("This record was deleted on Oct 2.", {
        title: "Record deleted",
        icon: "i-ph-trash",
        actions: [
          { label: "Open record r1", to: "/blocks/blocks-guard?record=r1" },
        ],
      });
    }
    return later({ id, name: "Acme Logistics SA" });
  }

  @Get("records/:id/facts")
  getRecordFacts(@Parameter("id", "param") id: string) {
    return later({
      items: [
        { label: "Record", value: id, type: "mono" },
        { label: "Name", value: "Acme Logistics SA" },
        { label: "Status", value: "Active", type: "status", tone: "success" },
      ],
    });
  }
}
