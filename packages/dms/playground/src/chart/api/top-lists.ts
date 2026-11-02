import { Controller, Get, Parameter } from "@antelopejs/interface-api";
import type { TopListItem } from "@antelopejs/interface-dms/base/top-list-card";
import { ownEntry } from "../../own-entry";

const MINUTE_MS = 60 * 1000;
const SPARKLINE_LENGTH = 8;
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary preset query strings require the existing indexed lookup and fallback.
const PRESET_SLOWDOWN: Record<string, number> = {
  "this-month": 1,
  "last-month": 1.2,
  "this-quarter": 1.4,
};

interface RouteTiming {
  route: string;
  ms: number;
  delta: number;
}

const ROUTE_TIMINGS: RouteTiming[] = [
  { route: "GET /api/reports/export", ms: 2840, delta: 12.5 },
  { route: "POST /api/checkout", ms: 920, delta: -8.1 },
  { route: "GET /api/orders", ms: 410, delta: 3.4 },
  { route: "GET /api/customers/:id", ms: 260, delta: -1.2 },
  { route: "PUT /api/carts/:id", ms: 180, delta: 0.6 },
  { route: "GET /api/health", ms: 12, delta: 0 },
];

interface PageVisit {
  title: string;
  visits: number;
  minutesAgo: number;
  sparkline: number[];
}

const PAGE_VISITS: PageVisit[] = [
  {
    title: "Home",
    visits: 18420,
    minutesAgo: 3,
    sparkline: [10, 12, 14, 13, 15, 18],
  },
  {
    title: "Catalogue",
    visits: 12200,
    minutesAgo: 12,
    sparkline: [10, 11, 11, 10, 12, 12],
  },
  {
    title: "Blog",
    visits: 8900,
    minutesAgo: 45,
    sparkline: [12, 10, 9, 9, 10, 9],
  },
  {
    title: "Contact",
    visits: 4100,
    minutesAgo: 180,
    sparkline: [4, 4, 4, 5, 4, 4],
  },
];

function timingSparkline(ms: number): number[] {
  return Array.from({ length: SPARKLINE_LENGTH }, (_, index) =>
    Math.round(ms * (1 + ((index % 3) - 1) / 10)),
  );
}

function routeItem(timing: RouteTiming, slowdown: number): TopListItem {
  return {
    id: timing.route,
    title: timing.route,
    value: Math.round(timing.ms * slowdown),
    delta: timing.delta,
    sparkline: timingSparkline(timing.ms * slowdown),
  };
}

function pageItem(page: PageVisit): TopListItem {
  return {
    id: page.title,
    title: page.title,
    description: {
      key: "demo.blocks.top_list.last_visit",
      params: {
        at: {
          type: "relative",
          value: new Date(
            Date.now() - page.minutesAgo * MINUTE_MS,
          ).toISOString(),
        },
      },
    },
    value: page.visits,
    sparkline: page.sparkline,
  };
}

/** Rankings of the TopListCard demos. */
export class TopListDemoApiController extends Controller("/api/dashboard/top") {
  @Get("routes")
  getRoutes(@Parameter("preset", "query") preset?: string) {
    const slowdown = ownEntry(PRESET_SLOWDOWN, preset ?? "") ?? 1;
    return {
      items: ROUTE_TIMINGS.map((timing) => routeItem(timing, slowdown)),
    };
  }

  @Get("pages")
  getPages() {
    return { items: PAGE_VISITS.map(pageItem) };
  }
}
