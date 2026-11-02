import { Controller, Get, Parameter, Post } from "@antelopejs/interface-api";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import type { Tone } from "@antelopejs/interface-dms/base/types";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { ownEntry } from "../own-entry";

/** Published on each batch of requests the live page follows. */
export const LIVE_DEMO_TOPIC = "blocks:live-demo";
const BATCH_EVENT_TYPE = "requests.batch";
const DEMO_LATENCY_MS = 400;
const BATCH_SIZE = 40;
const BATCH_SERVER_ERRORS = 2;
const BURST_BATCHES = 3;
const BURST_INTERVAL_MS = 1_500;
const MAX_FEED_ENTRIES = 30;
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary preset query strings require the existing indexed lookup and fallback.
const PRESET_SCALES: Record<string, number> = {
  "last-hour": 1,
  "last-24h": 24,
  "last-7-days": 168,
  "last-30-days": 720,
};
const HTTP_STATUSES = [200, 200, 201, 200, 404, 200, 500];
const ROUTES = [
  "GET /api/orders",
  "POST /api/checkout",
  "GET /api/customers/42",
  "PUT /api/carts/7",
];

interface StatusLook {
  from: number;
  tone: Tone;
  icon: string;
}

const STATUS_LOOKS: StatusLook[] = [
  { from: 500, tone: "error", icon: "i-ph-x-circle" },
  { from: 400, tone: "warning", icon: "i-ph-warning-circle" },
  { from: 0, tone: "success", icon: "i-ph-check-circle" },
];

interface LiveTotals {
  requests: number;
  serverErrors: number;
  rowsTouched: number;
}

interface RequestBatch {
  count: number;
  server5xx: number;
}

const totals: LiveTotals = {
  requests: 1_240,
  serverErrors: 18,
  rowsTouched: 0,
};
const feed: ActivityFeedItem[] = [];
let sequence = 0;

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

function feedEntry(): ActivityFeedItem {
  sequence += 1;
  const status = HTTP_STATUSES[sequence % HTTP_STATUSES.length];
  const look =
    STATUS_LOOKS.find((entry) => status >= entry.from) ??
    STATUS_LOOKS[STATUS_LOOKS.length - 1];
  return {
    id: `request-${sequence}`,
    icon: look.icon,
    tone: look.tone,
    title: `${ROUTES[sequence % ROUTES.length]} → ${status}`,
    meta: [`batch #${sequence}`],
    date: new Date().toISOString(),
  };
}

async function publishBatch(): Promise<void> {
  const batch: RequestBatch = {
    count: BATCH_SIZE,
    server5xx: BATCH_SERVER_ERRORS,
  };
  totals.requests += batch.count;
  totals.serverErrors += batch.server5xx;
  feed.unshift(feedEntry());
  feed.splice(MAX_FEED_ENTRIES);
  await PublishMessage(LIVE_DEMO_TOPIC, BATCH_EVENT_TYPE, {
    payload: { ...batch },
  });
}

function publishLater(delayMs: number): void {
  setTimeout(() => {
    publishBatch().catch((error: unknown) => {
      console.warn("[playground] live batch failed", error);
    });
  }, delayMs);
}

function liveStats(preset: string | undefined): StatGroupItem[] {
  const scale = ownEntry(PRESET_SCALES, preset ?? "") ?? 1;
  return [
    {
      icon: "i-ph-arrows-left-right",
      eyebrow: "Requests",
      value: totals.requests * scale,
      detail: preset ?? "last-hour",
    },
    {
      icon: "i-ph-x-circle",
      tone: "error",
      eyebrow: "5xx",
      value: totals.serverErrors * scale,
      detailTone: "error",
    },
    {
      icon: "i-ph-rows",
      tone: "info",
      eyebrow: "Rows touched",
      value: totals.rowsTouched,
      detail: "payload.ids events",
    },
  ];
}

/** Routes of the live mode demo: figures, a request log and the publishers. */
export class BlocksLiveApiController extends Controller("/api/blocks/live") {
  @Get("stats")
  getStats(@Parameter("preset", "query") preset?: string) {
    return later({ items: liveStats(preset) });
  }

  @Get("requests")
  getRequests() {
    return later({ items: feed, count: feed.length });
  }

  @Get("health")
  getHealth() {
    return later({
      requests: totals.requests,
      serverErrors: totals.serverErrors,
      checkedAt: new Date().toISOString(),
    });
  }

  @Post("burst")
  burst() {
    for (let batch = 0; batch < BURST_BATCHES; batch += 1) {
      publishLater(batch * BURST_INTERVAL_MS);
    }
    return { batches: BURST_BATCHES };
  }

  @Post("rows")
  async touchRows() {
    const ids = ["order-1", "order-2", "order-3"];
    totals.rowsTouched += ids.length;
    await PublishMessage(LIVE_DEMO_TOPIC, BATCH_EVENT_TYPE, {
      payload: { ids },
    });
    return { ids };
  }
}
