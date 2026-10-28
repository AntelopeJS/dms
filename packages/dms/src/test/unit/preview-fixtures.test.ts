import { expect } from "chai";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { registerPreviewFixtures } from "../../pages/preview";
import { createClient } from "../helpers/http";

const BASE = "/api/block-preview/fixtures";
const client = createClient();

interface RequestRow {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: string;
  statusTone: string;
  durationTone: string;
}

interface RequestPage {
  results: RequestRow[];
  total: number;
}

interface ChartPoint {
  x: string;
  y: number;
  label?: string;
}

interface ChartSeries {
  name: string;
  data: ChartPoint[];
}

interface ChartResponse {
  value: number;
  delta?: number;
  series: ChartSeries[];
}

async function requests(query = ""): Promise<RequestPage> {
  const response = await client.get<RequestPage>(`${BASE}/requests${query}`);
  expect(response.status).to.equal(200);
  return response.data;
}

describe("[unit] public preview fixtures", () => {
  const routeIds: number[] = [];

  before(async () => {
    expect(
      getRegisteredRoutes().filter((route) => route.location.startsWith(BASE)),
    ).to.deep.equal([]);
    expect((await client.get(`${BASE}/workspace`)).status).to.equal(404);
    registerPreviewFixtures();
    routeIds.push(
      ...getRegisteredRoutes()
        .filter((route) => route.location.startsWith(BASE))
        .map((route) => Number(route.id)),
    );
  });

  after(() => {
    routeIds.forEach(UnregisterRoute);
  });

  it("exposes exactly seven GET routes, without authorizing writes", async () => {
    const routes = getRegisteredRoutes().filter((route) =>
      route.location.startsWith(BASE),
    );
    expect(
      routes.map((route) => `${route.method.toUpperCase()} ${route.location}`),
    ).to.have.members([
      `GET ${BASE}/requests`,
      `GET ${BASE}/workspace`,
      `GET ${BASE}/sales`,
      `GET ${BASE}/channels`,
      `GET ${BASE}/customer`,
      `GET ${BASE}/customer/facts`,
      `GET ${BASE}/alerts`,
    ]);
    for (const route of routes) {
      expect((await client.post(route.location, {})).status).to.equal(404);
    }
  });

  it("serves twelve fixed, fully populated request rows without credentials", async () => {
    const page = await requests();
    expect(page.total).to.equal(12);
    expect(page.results).to.have.length(12);
    expect(new Set(page.results.map((row) => row.requestId)).size).to.equal(12);
    expect(page.results[0]).to.deep.equal({
      requestId: "req-001",
      method: "GET",
      path: "/api/customers",
      status: 200,
      durationMs: 42,
      at: "2026-01-12T10:00:00.000Z",
      statusTone: "success",
      durationTone: "neutral",
    });
    for (const row of page.results) {
      expect(row).to.have.all.keys(
        "requestId",
        "method",
        "path",
        "status",
        "durationMs",
        "at",
        "statusTone",
        "durationTone",
      );
      expect(new Date(row.at).toISOString()).to.equal(row.at);
    }
  });

  it("combines search, method filters, numeric sort and offset pagination before counting", async () => {
    const page = await requests(
      "?search=%20API%20&filter_method=is:GET&sortKey=durationMs&sortDirection=desc&offset=1&limit=2",
    );
    expect(page.total).to.equal(6);
    expect(page.results.map((row) => row.requestId)).to.deep.equal([
      "req-008",
      "req-012",
    ]);
    expect(
      (await requests("?search=REPORTS&filter_method=is:GET")).results.map(
        (row) => row.requestId,
      ),
    ).to.deep.equal(["req-003"]);
    expect((await requests("?search=missing-no-match")).total).to.equal(0);
    expect((await requests("?offset=12&limit=2")).results).to.deep.equal([]);
    const notPost = await requests("?filter_method=is_not:POST");
    expect(notPost.total).to.equal(9);
    expect(notPost.results.some((row) => row.method === "POST")).to.equal(
      false,
    );
    expect((await requests("?filter_method=is_empty")).total).to.equal(0);
    expect((await requests("?filter_method=is_not_empty")).total).to.equal(12);

    expect((await requests()).results[0].requestId).to.equal("req-001");
  });

  it("supports ascending status sort, threshold filters and inclusive period/hold bounds", async () => {
    const errors = await requests(
      "?filter_status=greater_than_or_equal_to:400&sortKey=status&sortDirection=asc",
    );
    expect(errors.results.map((row) => row.status)).to.deep.equal([
      404, 422, 500, 503,
    ]);
    const period = await requests(
      "?from=2026-01-12T09:20:00.000Z&to=2026-01-12T09:40:00.000Z&liveHeldAt=2026-01-12T09:30:00.000Z&sortKey=at&sortDirection=asc",
    );
    expect(period.total).to.equal(3);
    expect(period.results.map((row) => row.requestId)).to.deep.equal([
      "req-009",
      "req-008",
      "req-007",
    ]);
  });

  it("returns the workspace record directly and preserves it across reads", async () => {
    const expected = {
      name: "Acme Inc.",
      email: "billing@example.com",
      plan: "business",
      notifications: true,
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.get(`${BASE}/workspace`);
      expect(response.status).to.equal(200);
      expect(response.data).to.deep.equal(expected);
    }
  });

  it("serves a dated revenue series and four positive slices in the first channel series", async () => {
    const sales = await client.get<ChartResponse>(`${BASE}/sales`);
    expect(sales.status).to.equal(200);
    expect(sales.data.value).to.equal(48210);
    expect(sales.data.delta).to.equal(12.4);
    expect(sales.data.series[0].name).to.equal("Revenue");
    expect(sales.data.series[0].data).to.have.length(7);
    expect(
      sales.data.series[0].data.reduce((sum, point) => sum + point.y, 0),
    ).to.equal(48210);
    for (const point of sales.data.series[0].data) {
      expect(new Date(point.x).toISOString()).to.equal(point.x);
    }
    const channels = await client.get<ChartResponse>(`${BASE}/channels`);
    expect(channels.status).to.equal(200);
    expect(channels.data.value).to.equal(14600);
    expect(channels.data.series).to.have.length(1);
    expect(channels.data.series[0].data).to.deep.equal([
      { x: "Direct", label: "Direct", y: 4200 },
      { x: "Email", label: "Email", y: 1800 },
      { x: "Search", label: "Search", y: 6500 },
      { x: "Social", label: "Social", y: 2100 },
    ]);
  });

  it("feeds Guard success and KeyValueList while keeping alerts intentionally empty", async () => {
    const customer = await client.get(`${BASE}/customer`);
    expect(customer.status).to.equal(200);
    expect(customer.data).to.deep.equal({
      id: "r1",
      name: "Acme Logistics SA",
    });
    const facts = await client.get(`${BASE}/customer/facts`);
    expect(facts.status).to.equal(200);
    expect(facts.data).to.deep.equal({
      items: [
        { label: "Record", value: "r1", type: "mono" },
        { label: "Name", value: "Acme Logistics SA" },
        { label: "Status", value: "Active", type: "status", tone: "success" },
      ],
    });
    const alerts = await client.get(`${BASE}/alerts`);
    expect(alerts.status).to.equal(200);
    expect(alerts.data).to.deep.equal([]);
  });
});
