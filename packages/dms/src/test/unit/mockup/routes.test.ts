import { mkdir, writeFile } from "node:fs/promises";
import { type ClientRequest, get, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { expect } from "chai";
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { closeMockupStreams, type MockupEngine } from "../../../mockup";
import { getBaseUrl } from "../../helpers/http";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const ORDERS = [
  { _id: "o1", customer: "Acme", total: 120 },
  { _id: "o2", customer: "Brightline", total: 480 },
  { _id: "o3", customer: "Corvid", total: 75 },
  { _id: "o4", customer: "Delta Acme", total: 310 },
  { _id: "o5", customer: "Evergreen", total: 220 },
];

const PEOPLE = [
  { _id: "a", name: "banana" },
  { _id: "b", name: "apple" },
  { _id: "c", name: "Cherry" },
  { _id: "d", name: "apple pie" },
  { _id: "e" },
];

const MIXED = [
  { _id: "n1", v: -1 },
  { _id: "d15", v: "1.5" },
  { _id: "s3", v: "-3" },
  { _id: "n5", v: -5 },
  { _id: "d125", v: "1.25" },
];

const SPEC = JSON.stringify({
  version: 1,
  pages: [
    {
      id: "home",
      title: "Home",
      fixtures: {
        orders: ORDERS,
        revenue: { value: 9 },
        people: PEOPLE,
        mixed: MIXED,
        mixedReversed: [...MIXED].reverse(),
        mixedRotated: [...MIXED.slice(2), ...MIXED.slice(0, 2)],
      },
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

const placeSchema = z.object({ page: z.string(), path: z.string() });
const placesSchema = z.object({ annotations: z.array(placeSchema) });

const specSourceSchema = z.object({
  digest: z.string(),
  spec: z.object({
    pages: z.array(z.object({ tree: z.array(z.unknown()) })),
  }),
});

const idsSchema = rowsSchema.transform((page) =>
  page.results.map((row) => row._id),
);

function ids(data: unknown): string[] {
  return idsSchema.parse(data);
}

describe("[unit] mockup routes: listing and fixtures", () => {
  const served = serveMockupRoutes(SPEC);
  let owner: AxiosInstance;

  before(() => {
    ({ owner } = served());
  });

  it("lists the mockups at the API root as the rows of a source table", async () => {
    const listed = await owner.get(BASE);

    expect(listed.status).to.equal(200);
    expect(listed.data).to.have.property("total", 1);
    expect(listed.data).to.have.nested.property("results[0].name", "desk");
  });

  it("sorts, searches and pages an array fixture's rows", async () => {
    const rows = `${BASE}/desk/pages/home/fixtures/orders/rows`;
    const sorted = await owner.get(
      `${rows}?sortKey=total&sortDirection=desc&offset=1&limit=2`,
    );
    const searched = await owner.get(`${rows}?search=acme&sortKey=total`);
    const all = await owner.get(rows);

    expect(ids(sorted.data)).to.deep.equal(["o4", "o5"]);
    expect(rowsSchema.parse(sorted.data).total).to.equal(5);
    expect(ids(searched.data)).to.deep.equal(["o1", "o4"]);
    expect(ids(all.data)).to.deep.equal(["o1", "o2", "o3", "o4", "o5"]);
  });

  it("serves a fixture as JSON and refuses rows over one that is not an array", async () => {
    const fixture = await owner.get(`${BASE}/desk/pages/home/fixtures/revenue`);
    const rows = await owner.get(
      `${BASE}/desk/pages/home/fixtures/revenue/rows`,
    );

    expect(fixture.data).to.deep.equal({ value: 9 });
    expect(rows.status).to.equal(404);
  });

  it("sorts text as people read it and keeps rows missing the value last", async () => {
    const rows = `${BASE}/desk/pages/home/fixtures/people/rows?sortKey=name`;
    const ascending = await owner.get(rows);
    const descending = await owner.get(`${rows}&sortDirection=desc`);

    expect(ids(ascending.data)).to.deep.equal(["b", "d", "a", "c", "e"]);
    expect(ids(descending.data)).to.deep.equal(["c", "a", "d", "b", "e"]);
  });

  it("sorts numbers and numeric text by value in one order, whatever the rows' order", async () => {
    const orders = await Promise.all(
      ["mixed", "mixedReversed", "mixedRotated"].map(async (key) =>
        ids(
          (
            await owner.get(
              `${BASE}/desk/pages/home/fixtures/${key}/rows?sortKey=v`,
            )
          ).data,
        ),
      ),
    );

    expect(orders).to.deep.equal([
      ["n5", "s3", "n1", "d125", "d15"],
      ["n5", "s3", "n1", "d125", "d15"],
      ["n5", "s3", "n1", "d125", "d15"],
    ]);
  });
});

describe("[unit] mockup routes: annotations and events", () => {
  const served = serveMockupRoutes(SPEC);
  let owner: AxiosInstance;

  before(() => {
    ({ owner } = served());
  });

  it("answers 404 for the events of a mockup that does not exist", async () => {
    const missing = await owner.get(`${BASE}/nope/events`);

    expect(missing.status).to.equal(404);
  });
});

describe("[unit] mockup routes: annotations", () => {
  const served = serveMockupRoutes(SPEC);
  let owner: AxiosInstance;
  let base: string;

  before(() => {
    ({ owner, dir: base } = served());
  });

  it("refuses an annotation on a page or node the spec does not have", async () => {
    const note = { text: "Somewhere" };
    const ghostPage = await owner.post(`${BASE}/desk/annotations`, {
      ...note,
      page: "ghost",
      path: "/pages/0/tree/0",
    });
    const ghostNode = await owner.post(`${BASE}/desk/annotations`, {
      ...note,
      page: "home",
      path: "/pages/9/tree/9",
    });

    expect([ghostPage.status, ghostNode.status]).to.deep.equal([404, 404]);
  });

  it("creates an annotation, then resolves it with PATCH", async () => {
    const created = await owner.post(`${BASE}/desk/annotations`, {
      page: "home",
      path: "/pages/0/tree/0",
      text: "Move the KPI left",
    });
    const { id } = annotationSchema.parse(created.data);
    const resolved = await owner.patch(`${BASE}/desk/annotations/${id}`, {
      status: "resolved",
    });
    const refused = await owner.post(`${BASE}/desk/annotations`, {
      page: "home",
      path: "no-pointer",
      text: "",
    });
    const listed = await owner.get(`${BASE}/desk/annotations`);

    expect(annotationSchema.parse(resolved.data).status).to.equal("resolved");
    expect(annotationSchema.parse(resolved.data).resolvedAt).to.be.a("string");
    expect(refused.status).to.equal(400);
    expect(listed.data).to.deep.equal({ annotations: [resolved.data] });
  });

  it("serves a note where its block is after a whole-spec write moved it, and answers a spec that does not parse with 409 (fails when notes keep the pointer they were posted with)", async () => {
    const sketch = (html: string) => ({
      type: "sketch",
      options: { html, height: 80 },
    });
    const shelf = (...tree: unknown[]) => ({
      version: 1,
      pages: [{ id: "home", title: "Home", tree }],
    });
    await mkdir(join(base, "mockups", "shelf"), { recursive: true });
    await writeFile(
      join(base, "mockups", "shelf", "spec.json"),
      JSON.stringify(shelf(sketch("a"), sketch("b"))),
    );

    const posted = await owner.post(`${BASE}/shelf/annotations`, {
      page: "home",
      path: "/pages/0/tree/1",
      text: "About b",
    });
    const source = specSourceSchema.parse(
      (await owner.get(`${BASE}/shelf/spec`)).data,
    );
    const [first, second] = source.spec.pages[0].tree;
    const written = await owner.put(`${BASE}/shelf/spec`, {
      spec: shelf(sketch("new"), first, second),
      digest: source.digest,
    });
    const listed = await owner.get(`${BASE}/shelf/annotations`);
    await writeFile(join(base, "mockups", "shelf", "spec.json"), "{ not json");
    const refused = await owner.post(`${BASE}/shelf/annotations`, {
      page: "home",
      path: "/pages/0/tree/0",
      text: "Anywhere",
    });

    expect(posted.status).to.equal(200);
    expect(placeSchema.parse(posted.data)).to.deep.equal({
      page: "home",
      path: "/pages/0/tree/1",
    });
    expect(written.status).to.equal(200);
    expect(
      placesSchema.parse(listed.data).annotations.map(({ path }) => path),
    ).to.deep.equal(["/pages/0/tree/2"]);
    expect(refused.status).to.equal(409);
  });
});

describe("[unit] mockup routes: events", () => {
  const served = serveMockupRoutes(SPEC);
  let ownerToken: string;
  let engine: MockupEngine;
  let base: string;

  before(() => {
    ({ ownerToken, engine, dir: base } = served());
  });

  it("streams the state on connect and ends the stream when the engine stops", async () => {
    const { response, firstChunk } = await openEvents("desk", ownerToken);
    const ended = new Promise<void>((resolve) => {
      response.once("end", resolve);
    });

    closeMockupStreams(engine);
    response.resume();
    await ended;

    expect(firstChunk).to.contain("event: state\ndata: ");
    expect(engine.streams.size).to.equal(0);
  });

  it("releases a stream and its watch once the client goes away", async () => {
    const clients = await Promise.all([
      openEvents("desk", ownerToken),
      openEvents("desk", ownerToken),
    ]);
    expect(engine.streams.size).to.equal(2);

    clients.forEach(({ request }) => request.destroy());
    const released = await waitFor(() => engine.streams.size === 0);
    await writeFile(join(base, "mockups", "desk", "spec.json"), SPEC);

    expect(released).to.equal(true);
    expect(engine.store.isWatching()).to.equal(false);
  });
});

interface OpenEvents {
  request: ClientRequest;
  response: IncomingMessage;
  firstChunk: string;
}

/** Opens a mockup's event stream over HTTP as `token`'s user and reads its first frame. */
function openEvents(name: string, token: string): Promise<OpenEvents> {
  return new Promise((resolve, reject) => {
    const request = get(
      `${getBaseUrl()}${BASE}/${name}/events`,
      {
        headers: {
          "x-antelopejs-namespace": "default",
          Authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        response.once("data", (chunk: Buffer) => {
          response.pause();
          resolve({ request, response, firstChunk: chunk.toString("utf8") });
        });
      },
    );
    request.once("error", reject);
  });
}

const RELEASE_POLL_MS = 20;
const RELEASE_BUDGET_MS = 1000;

/** Whether `condition` holds within a second. */
async function waitFor(condition: () => boolean): Promise<boolean> {
  const deadline = Date.now() + RELEASE_BUDGET_MS;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, RELEASE_POLL_MS));
  }
  return condition();
}
