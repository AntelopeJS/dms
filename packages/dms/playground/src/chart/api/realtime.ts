import { Controller, Get, Post } from "@antelopejs/interface-api";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";

export const REALTIME_DEMO_TOPIC = "stats:realtime-demo";
const REALTIME_DEMO_EVENT_TYPE = "stats.update";

const SERIES_NAME = "Live counter";
const SERIES_LENGTH = 24;
const VALUE_MIN = 100;
const VALUE_RANGE = 400;

interface Point {
  x: string;
  y: number;
}

interface RealtimeDemoPayload {
  series: Array<{ name: string; data: Point[] }>;
}

let nextSequence = 0;

function buildPoint(): Point {
  const value = Math.round(VALUE_MIN + Math.random() * VALUE_RANGE);
  const label = `t${nextSequence}`;
  nextSequence += 1;
  return { x: label, y: value };
}

function buildInitialSeries(): Point[] {
  return Array.from({ length: SERIES_LENGTH }, () => buildPoint());
}

const realtimeSeries: Point[] = buildInitialSeries();

function appendNewPoint(): void {
  realtimeSeries.shift();
  realtimeSeries.push(buildPoint());
}

export class RealtimeDemoApiController extends Controller(
  "/api/dashboard/realtime",
) {
  @Get("data")
  getData(): RealtimeDemoPayload {
    return { series: [{ name: SERIES_NAME, data: realtimeSeries }] };
  }

  @Post("bump")
  async bump(): Promise<{ ok: boolean }> {
    appendNewPoint();
    await PublishMessage(REALTIME_DEMO_TOPIC, REALTIME_DEMO_EVENT_TYPE);
    return { ok: true };
  }
}
