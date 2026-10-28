import {
  Context,
  Controller,
  Get,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { ChartCardData } from "@antelopejs/interface-dms/base/query-response";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";

interface RequestFixture {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: string;
  statusTone: Tone;
  durationTone: Tone;
}

const REQUESTS: RequestFixture[] = [
  {
    requestId: "req-001",
    method: "GET",
    path: "/api/customers",
    status: 200,
    durationMs: 42,
    at: "2026-01-12T10:00:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-002",
    method: "POST",
    path: "/api/orders",
    status: 201,
    durationMs: 180,
    at: "2026-01-12T09:55:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-003",
    method: "GET",
    path: "/api/reports",
    status: 500,
    durationMs: 920,
    at: "2026-01-12T09:50:00.000Z",
    statusTone: "error",
    durationTone: "warning",
  },
  {
    requestId: "req-004",
    method: "PATCH",
    path: "/api/customers/acme",
    status: 200,
    durationMs: 85,
    at: "2026-01-12T09:45:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-005",
    method: "DELETE",
    path: "/api/sessions/expired",
    status: 204,
    durationMs: 31,
    at: "2026-01-12T09:40:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-006",
    method: "GET",
    path: "/api/orders/missing",
    status: 404,
    durationMs: 18,
    at: "2026-01-12T09:35:00.000Z",
    statusTone: "warning",
    durationTone: "neutral",
  },
  {
    requestId: "req-007",
    method: "POST",
    path: "/api/invoices",
    status: 422,
    durationMs: 63,
    at: "2026-01-12T09:30:00.000Z",
    statusTone: "warning",
    durationTone: "neutral",
  },
  {
    requestId: "req-008",
    method: "GET",
    path: "/api/channels",
    status: 200,
    durationMs: 120,
    at: "2026-01-12T09:25:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-009",
    method: "PUT",
    path: "/api/workspace",
    status: 200,
    durationMs: 210,
    at: "2026-01-12T09:20:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
  {
    requestId: "req-010",
    method: "GET",
    path: "/api/customers/acme",
    status: 304,
    durationMs: 12,
    at: "2026-01-12T09:15:00.000Z",
    statusTone: "info",
    durationTone: "neutral",
  },
  {
    requestId: "req-011",
    method: "POST",
    path: "/api/reports",
    status: 503,
    durationMs: 1250,
    at: "2026-01-12T09:10:00.000Z",
    statusTone: "error",
    durationTone: "warning",
  },
  {
    requestId: "req-012",
    method: "GET",
    path: "/api/invoices",
    status: 200,
    durationMs: 75,
    at: "2026-01-12T09:05:00.000Z",
    statusTone: "success",
    durationTone: "neutral",
  },
];

const SALES: ChartCardData = {
  value: 48210,
  delta: 12.4,
  series: [
    {
      name: "Revenue",
      data: [
        { x: "2026-01-05T00:00:00.000Z", y: 5800 },
        { x: "2026-01-06T00:00:00.000Z", y: 6400 },
        { x: "2026-01-07T00:00:00.000Z", y: 6100 },
        { x: "2026-01-08T00:00:00.000Z", y: 7200 },
        { x: "2026-01-09T00:00:00.000Z", y: 6850 },
        { x: "2026-01-10T00:00:00.000Z", y: 7460 },
        { x: "2026-01-11T00:00:00.000Z", y: 8400 },
      ],
    },
  ],
};

const CHANNELS: ChartCardData = {
  value: 14600,
  series: [
    {
      name: "Sessions",
      data: [
        { x: "Direct", label: "Direct", y: 4200 },
        { x: "Email", label: "Email", y: 1800 },
        { x: "Search", label: "Search", y: 6500 },
        { x: "Social", label: "Social", y: 2100 },
      ],
    },
  ],
};

const CUSTOMER_FACTS: KeyValueListItem[] = [
  { label: "Record", value: "r1", type: "mono" },
  { label: "Name", value: "Acme Logistics SA" },
  { label: "Status", value: "Active", type: "status", tone: "success" },
];

const DEFAULT_PAGE_SIZE = 20;
const SORTABLE_FIELDS = [
  "method",
  "path",
  "status",
  "durationMs",
  "at",
] as const;

function matchesColumn(value: string | number, filter: string | null): boolean {
  if (!filter) return true;
  const separator = filter.indexOf(":");
  const mode = separator < 0 ? filter : filter.slice(0, separator);
  const expected = filter.slice(separator + 1);
  if (mode === "is") return String(value) === expected;
  if (mode === "is_not") return String(value) !== expected;
  if (mode === "is_empty") return String(value) === "";
  if (mode === "is_not_empty") return String(value) !== "";
  if (mode === "greater_than_or_equal_to")
    return Number(value) >= Number(expected);
  return true;
}

function listRequests(query: URLSearchParams) {
  const search = query.get("search")?.trim().toLowerCase() ?? "";
  const from = query.get("from");
  const to = query.get("to");
  const heldAt = query.get("liveHeldAt");
  const rows = REQUESTS.filter(
    (row) =>
      `${row.method} ${row.path}`.toLowerCase().includes(search) &&
      matchesColumn(row.method, query.get("filter_method")) &&
      matchesColumn(row.status, query.get("filter_status")) &&
      (!from || row.at >= from) &&
      (!to || row.at <= to) &&
      (!heldAt || row.at <= heldAt),
  );
  const key = SORTABLE_FIELDS.find((field) => field === query.get("sortKey"));
  if (key) {
    const direction = query.get("sortDirection") === "desc" ? -1 : 1;
    rows.sort(
      (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * direction,
    );
  }
  const offset = Number(query.get("offset")) || 0;
  const limit = Number(query.get("limit")) || DEFAULT_PAGE_SIZE;
  return { results: rows.slice(offset, offset + limit), total: rows.length };
}

/** @internal Registers public, read-only demo data only when the preview page is enabled. */
export function registerPreviewFixtures() {
  class PreviewFixturesController extends Controller(
    "/api/block-preview/fixtures",
  ) {
    @Get("requests")
    requests(@Context() context: RequestContext) {
      return listRequests(context.url.searchParams);
    }

    @Get("workspace")
    workspace() {
      return {
        name: "Acme Inc.",
        email: "billing@example.com",
        plan: "business",
        notifications: true,
      };
    }

    @Get("sales")
    sales() {
      return SALES;
    }

    @Get("channels")
    channels() {
      return CHANNELS;
    }

    @Get("customer")
    customer() {
      return { id: "r1", name: "Acme Logistics SA" };
    }

    @Get("customer/facts")
    customerFacts() {
      return { items: CUSTOMER_FACTS };
    }

    @Get("alerts")
    alerts() {
      return [];
    }
  }
  return PreviewFixturesController;
}
