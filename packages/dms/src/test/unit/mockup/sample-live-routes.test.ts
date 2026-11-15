import { expect } from "chai";
import {
  type CompiledSpec,
  compileSpec,
  type JsonObject,
  jsonObjectSchema,
  mockupNameSchema,
  type MockupNode,
  type MockupSpecPage,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");
const LIVE = "/api/orders/stats";
const NO_FIXTURE_ROUTE = "/api/mockup/demo/pages/sales/fixtures/~live-route";
const ROWS_ROUTE = "/api/mockup/demo/pages/sales/fixtures/orders/rows";
const ROWS = [{ _id: "o1", customer: "Sample" }];

function page(
  tree: MockupNode[],
  extra: Partial<MockupSpecPage> = {},
): MockupSpecPage {
  return {
    id: "sales",
    title: "Sales",
    fixtures: { orders: ROWS },
    tree,
    ...extra,
  };
}

function compile(...pages: MockupSpecPage[]): CompiledSpec {
  const read = parseSpec(JSON.stringify({ version: 1, pages }));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function optionsOf(compiled: CompiledSpec, index = 0): JsonObject {
  return compiled.pages[0].tree[index].options ?? {};
}

/** A fixture table's options as `TableView.fromSource` serializes them, reading `route` instead. */
function serializedTable(route: string): JsonObject {
  const fixtureTable = compile(
    page([
      {
        type: "TableView",
        options: {
          fetchUrl: "fixture:orders",
          rowIdKey: "_id",
          columns: { customer: { name: "Customer", type: "string" } },
        },
      },
    ]),
  );
  const text = JSON.stringify(optionsOf(fixtureTable));
  expect(text).to.include(ROWS_ROUTE);
  return jsonObjectSchema.parse(JSON.parse(text.replaceAll(ROWS_ROUTE, route)));
}

describe("[unit] mockup sample tree reads no live route", () => {
  it("points a KpiCard that names a live route at a fixture route that reads nothing", () => {
    const compiled = compile(
      page([
        { type: "KpiCard", options: { title: "Revenue", fetchUrl: LIVE } },
      ]),
    );

    expect(optionsOf(compiled).fetchUrl).to.equal(NO_FIXTURE_ROUTE);
    expect(JSON.stringify(compiled.pages[0].tree)).not.to.include(LIVE);
  });

  it("points a ChartCard that names a live route at a fixture route that reads nothing", () => {
    const compiled = compile(
      page([
        {
          type: "ChartCard",
          options: { title: "Sales", fetchUrl: LIVE },
          children: [{ id: "chart", type: "ChartArea" }],
        },
      ]),
    );

    expect(optionsOf(compiled).fetchUrl).to.equal(NO_FIXTURE_ROUTE);
    expect(JSON.stringify(compiled.pages[0].tree)).not.to.include(LIVE);
  });

  it("points a serialized TableView source that names a live route at a fixture route that reads nothing", () => {
    const compiled = compile(
      page([{ type: "TableView", options: serializedTable(LIVE) }]),
    );

    const text = JSON.stringify(compiled.pages[0].tree);
    expect(text).not.to.include(LIVE);
    expect(text).to.include(NO_FIXTURE_ROUTE);
  });

  it("keeps a fixture table reading its rows route", () => {
    const compiled = compile(
      page([{ type: "TableView", options: serializedTable(ROWS_ROUTE) }]),
    );

    expect(JSON.stringify(compiled.pages[0].tree)).to.include(ROWS_ROUTE);
    expect(JSON.stringify(compiled.pages[0].tree)).not.to.include(
      NO_FIXTURE_ROUTE,
    );
  });

  it("confines every other request a block makes, without an issue that would refuse the spec", () => {
    const compiled = compile(
      page([
        {
          type: "KpiCard",
          options: {
            title: "Revenue",
            fetchUrl: "fixture:orders",
            actions: [
              { url: "/api/orders/export", location: "/api/orders" },
              { src: "/api/files/avatar", renderEndpoint: "/api/render" },
            ],
          },
        },
      ]),
    );

    const options = optionsOf(compiled);
    expect(options.actions).to.deep.equal([
      { url: NO_FIXTURE_ROUTE, location: NO_FIXTURE_ROUTE },
      { src: NO_FIXTURE_ROUTE, renderEndpoint: NO_FIXTURE_ROUTE },
    ]);
    expect(compiled.issues).to.deep.equal([]);
  });

  it("reads a route that climbs out of the page's fixtures as a live one", () => {
    const climbing =
      "/api/mockup/demo/pages/sales/fixtures/../../../../orders/stats";
    const encoded =
      "/api/mockup/demo/pages/sales/fixtures/%2e%2e/%2e%2e/%2e%2e/%2e%2e/orders/stats";
    const compiled = compile(
      page([
        { type: "KpiCard", options: { title: "A", fetchUrl: climbing } },
        { type: "KpiCard", options: { title: "B", fetchUrl: encoded } },
        {
          type: "KpiCard",
          options: { title: "C", fetchUrl: `//elsewhere.test${ROWS_ROUTE}` },
        },
      ]),
    );

    expect(
      [0, 1, 2].map((index) => optionsOf(compiled, index).fetchUrl),
    ).to.deep.equal([NO_FIXTURE_ROUTE, NO_FIXTURE_ROUTE, NO_FIXTURE_ROUTE]);
  });

  it("leaves the Real data tree on the routes the spec names", () => {
    const compiled = compile(
      page(
        [
          {
            type: "KpiCard",
            options: { title: "Revenue", fetchUrl: LIVE },
          },
        ],
        { liveRoutes: { orders: "/api/orders/list" } },
      ),
    );

    expect(compiled.pages[0].realTree?.[0].options?.fetchUrl).to.equal(LIVE);
    expect(optionsOf(compiled).fetchUrl).to.equal(NO_FIXTURE_ROUTE);
  });
});
