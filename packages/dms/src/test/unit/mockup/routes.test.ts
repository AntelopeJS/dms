import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { expect } from "chai";
import {
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { z } from "zod";
import {
  closeMockupStreams,
  type MockupEngine,
  MockupStore,
  registerMockupRoutes,
} from "../../../mockup";
import { createClient } from "../../helpers/http";

const BASE = "/api/mockup";
const client = createClient();

const ORDERS = [
  { _id: "o1", customer: "Acme", total: 120 },
  { _id: "o2", customer: "Brightline", total: 480 },
  { _id: "o3", customer: "Corvid", total: 75 },
  { _id: "o4", customer: "Delta Acme", total: 310 },
  { _id: "o5", customer: "Evergreen", total: 220 },
];

const SPEC = JSON.stringify({
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: { orders: ORDERS, revenue: { value: 9 } },
      tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
    },
  ],
});

const rowsSchema = z.object({
  results: z.array(z.object({ _id: z.string() })),
  total: z.number(),
});

const annotationSchema = z.object({
  id: z.string(),
  status: z.enum(["open", "resolved"]),
  text: z.string(),
  resolvedAt: z.string().optional(),
});

const idsSchema = rowsSchema.transform((page) =>
  page.results.map((row) => row._id),
);

function ids(data: unknown): string[] {
  return idsSchema.parse(data);
}

describe("[unit] mockup routes", () => {
  let base: string;
  let engine: MockupEngine;
  let controller: ReturnType<typeof registerMockupRoutes>;
  const routeIds: number[] = [];

  before(async () => {
    expect(
      getRegisteredRoutes().filter((route) => route.location.startsWith(BASE)),
    ).to.deep.equal([]);
    base = await mkdtemp(join(tmpdir(), "dms-mockup-routes-"));
    await mkdir(join(base, "mockups", "desk"), { recursive: true });
    await writeFile(join(base, "mockups", "desk", "spec.json"), SPEC);
    engine = {
      store: new MockupStore(join(base, "mockups")),
      streams: new Set(),
    };
    controller = registerMockupRoutes(engine);
    routeIds.push(
      ...getRegisteredRoutes()
        .filter((route) => route.location.startsWith(BASE))
        .map((route) => Number(route.id)),
    );
  });

  after(async () => {
    routeIds.forEach(UnregisterRoute);
    closeMockupStreams(engine);
    engine.store.close();
    await rm(base, { recursive: true, force: true });
  });

  it("lists the mockups at the API root", async () => {
    const listed = await client.get(BASE);

    expect(listed.status).to.equal(200);
    expect(listed.data).to.deep.equal({
      mockups: [{ name: "desk", pages: 1 }],
    });
  });

  it("sorts, searches and pages an array fixture's rows", async () => {
    const rows = `${BASE}/desk/pages/home/fixtures/orders/rows`;
    const sorted = await client.get(
      `${rows}?sortKey=total&sortDirection=desc&offset=1&limit=2`,
    );
    const searched = await client.get(`${rows}?search=acme&sortKey=total`);
    const all = await client.get(rows);

    expect(ids(sorted.data)).to.deep.equal(["o4", "o5"]);
    expect(rowsSchema.parse(sorted.data).total).to.equal(5);
    expect(ids(searched.data)).to.deep.equal(["o1", "o4"]);
    expect(ids(all.data)).to.deep.equal(["o1", "o2", "o3", "o4", "o5"]);
  });

  it("serves a fixture as JSON and refuses rows over one that is not an array", async () => {
    const fixture = await client.get(
      `${BASE}/desk/pages/home/fixtures/revenue`,
    );
    const rows = await client.get(
      `${BASE}/desk/pages/home/fixtures/revenue/rows`,
    );

    expect(fixture.data).to.deep.equal({ value: 9 });
    expect(rows.status).to.equal(404);
  });

  it("creates an annotation, then resolves it with PATCH", async () => {
    const created = await client.post(`${BASE}/desk/annotations`, {
      page: "home",
      path: "/pages/0/tree/0",
      text: "Move the KPI left",
    });
    const { id } = annotationSchema.parse(created.data);
    const resolved = await client.patch(`${BASE}/desk/annotations/${id}`, {
      status: "resolved",
    });
    const refused = await client.post(`${BASE}/desk/annotations`, {
      page: "home",
      path: "no-pointer",
      text: "",
    });
    const listed = await client.get(`${BASE}/desk/annotations`);

    expect(annotationSchema.parse(resolved.data).status).to.equal("resolved");
    expect(annotationSchema.parse(resolved.data).resolvedAt).to.be.a("string");
    expect(refused.status).to.equal(400);
    expect(listed.data).to.deep.equal({ annotations: [resolved.data] });
  });

  it("streams the state on connect and ends the stream when the engine stops", async () => {
    const stream = new PassThrough();
    const ended = new Promise<void>((resolve) => {
      stream.once("end", resolve);
    });
    await new controller().events("desk", stream);
    const frames = String(stream.read() ?? "");

    closeMockupStreams(engine);
    stream.resume();
    await ended;

    expect(frames).to.contain("event: state\ndata: ");
    expect(engine.streams.size).to.equal(0);
  });
});
