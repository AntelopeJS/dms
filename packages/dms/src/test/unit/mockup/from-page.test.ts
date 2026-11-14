import { expect } from "chai";
import { z } from "zod";
import {
  compileSpec,
  type ConvertedPage,
  convertPage,
  type MockupNode,
  mockupNameSchema,
  openOracle,
  parseSpec,
  type SketchNote,
} from "../../../mockup";
import {
  BOOK_RESOURCE,
  type BlockDraft,
  structureOf,
  unmappedPaths,
} from "../../helpers/live-page";
import { ACCEPTED_ROUTES, REFUSED_ROUTES } from "../../helpers/relative-routes";

const NAME = mockupNameSchema.parse("books");
const REF = "/books";

function convert(blocks: BlockDraft[]): ConvertedPage {
  return convertPage(structureOf(REF, blocks), "books", {
    oracle: openOracle(NAME, "books"),
    resources: new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]),
  });
}

function issuesOf(converted: ConvertedPage) {
  const read = parseSpec(
    JSON.stringify({ version: 1, pages: [converted.page] }),
  );
  if (!read.ok) return read.issues;
  return compileSpec(NAME, read.spec).issues;
}

function nodeNamed(nodes: readonly MockupNode[], id: string): MockupNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

function chain(depth: number): BlockDraft {
  return depth === 0
    ? { name: "leaf", type: "KpiCard", config: { title: "Leaf" } }
    : { name: `level${depth}`, type: "VStack", children: [chain(depth - 1)] };
}

const EVERY_ROW: BlockDraft[] = [
  { name: "hero", type: null },
  { name: "legacy", type: "KpiCard", editable: false },
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
  {
    name: "owner",
    type: "KpiCard",
    config: {
      title: "Owner",
      meta: { source: { $ref: { resource: "user" } } },
    },
  },
  { name: "computed", type: "KpiCard", config: { title: { $expr: "TITLE" } } },
  {
    name: "sales",
    type: "ChartCard",
    config: {
      title: "Sales",
      fetchUrl: "/api/books/sales",
      chart: {
        $block: { type: "ChartArea", config: { xaxisType: "datetime" } },
      },
    },
  },
  { name: "ghost", type: "NotARegisteredBlock", config: {} },
  { name: "broken", type: "KpiCard", config: { title: 42 } },
  {
    name: "layout",
    type: "Grid",
    children: [{ name: "loose", type: null }],
  },
  {
    name: "rows",
    type: "Grid",
    children: [
      {
        name: "row",
        type: "GridRow",
        children: [
          {
            name: "a",
            type: "KpiCard",
            config: { title: "A" },
            meta: { colSpan: 2 },
          },
          { name: "b", type: null },
        ],
      },
    ],
  },
  {
    name: "table",
    type: "TableView",
    controller: "book",
    config: { caption: "Books", pageSize: 20, views: [{ id: "all" }] },
  },
  { name: "unbound", type: "TableView", controller: "missing", config: {} },
  { name: "form", type: "ResourceForm", controller: "book", config: {} },
  {
    name: "filtered",
    type: "ActivityFeed",
    config: { fetchUrl: "/api/feed?status={{query.status}}" },
  },
  {
    name: "remote",
    type: "KpiCard",
    config: { title: "Remote", fetchUrl: "https://example.com/kpi" },
  },
  chain(40),
];

const optionsSchema = z.object({ fetchUrl: z.string() }).passthrough();

describe("[unit] mockup conversion of a live page", () => {
  it("gives every block of every row a node, with zero issues", () => {
    const converted = convert(EVERY_ROW);
    const blocks = structureOf(REF, EVERY_ROW).blocks;

    expect(issuesOf(converted)).to.deep.equal([]);
    expect(unmappedPaths(blocks, converted.page.tree)).to.deep.equal([]);
    expect(converted.page.tree.map((node) => node.id)).to.deep.equal(
      EVERY_ROW.map((block) => block.name),
    );
  });

  it("sketches exactly the blocks a mockup cannot draw, each with its reason", () => {
    const expected: SketchNote[] = [
      { path: "/books#hero", reason: "custom-component" },
      { path: "/books#legacy", reason: "opaque" },
      { path: "/books#owner", reason: "sentinel" },
      { path: "/books#computed", reason: "sentinel" },
      { path: "/books#ghost", reason: "unknown-type" },
      { path: "/books#broken", reason: "invalid-options" },
      { path: "/books#layout", reason: "children-not-allowed" },
      { path: "/books#rows/row/b", reason: "custom-component" },
      { path: "/books#unbound", reason: "controller" },
      { path: "/books#form", reason: "controller" },
      { path: "/books#remote", reason: "remote-route" },
      {
        path: "/books#level40/level39/level38/level37/level36/level35/level34/level33/level32/level31/level30/level29/level28/level27/level26/level25/level24/level23/level22/level21/level20/level19/level18/level17/level16/level15/level14/level13/level12/level11/level10/level9",
        reason: "too-deep",
      },
    ];

    expect(convert(EVERY_ROW).sketches).to.deep.equal(expected);
  });

  it("writes no value set in code into the spec", () => {
    const text = JSON.stringify(convert(EVERY_ROW).page);

    for (const sentinel of ["$ref", "$expr", "$dataType", "$block"]) {
      expect(text, sentinel).not.to.contain(`"${sentinel}"`);
    }
  });

  it("lifts a block an option holds into the child the spec writes in its place", () => {
    const sales = nodeNamed(convert(EVERY_ROW).page.tree, "sales");

    expect(sales.type).to.equal("ChartCard");
    expect(sales.options).not.to.have.property("chart");
    expect(sales.children).to.deep.equal([
      { id: "chart", type: "ChartArea", options: { xaxisType: "datetime" } },
    ]);
  });

  it("keeps a grid child's place: its id and its span", () => {
    const rows = nodeNamed(convert(EVERY_ROW).page.tree, "rows");
    const [row] = rows.children ?? [];

    expect(row?.id).to.equal("row");
    expect(
      row?.children?.map(({ id, type, colSpan }) => ({ id, type, colSpan })),
    ).to.deep.equal([
      { id: "a", type: "KpiCard", colSpan: 2 },
      { id: "b", type: "sketch", colSpan: undefined },
    ]);
  });

  it("lists a sketched container's children in it, and reports the container alone", () => {
    const layout = nodeNamed(convert(EVERY_ROW).page.tree, "layout");

    expect(layout.type).to.equal("sketch");
    expect(z.string().parse(layout.options?.html)).to.contain("<li>loose</li>");
  });

  it("reads each fetchUrl through a fixture: null for a block, sample rows for a table, the live route kept aside", () => {
    const { page } = convert(EVERY_ROW);
    const revenue = optionsSchema.parse(
      nodeNamed(page.tree, "revenue").options,
    );
    const table = nodeNamed(page.tree, "table");
    const tableOptions = optionsSchema.parse(table.options);

    expect(revenue.fetchUrl).to.equal("fixture:api-books-revenue");
    expect(tableOptions.fetchUrl).to.equal("fixture:rows-api-book-list");
    expect(page.liveRoutes).to.deep.equal({
      "api-books-revenue": "/api/books/revenue",
      "api-books-sales": "/api/books/sales",
      "rows-api-book-list": "/api/book/list",
      "api-feed-status-query-status": "/api/feed?status={{query.status}}",
    });
    expect(page.fixtures?.["api-books-revenue"]).to.equal(null);
    expect(page.fixtures?.["rows-api-book-list"]).to.deep.equal([
      { _id: "sample-1", title: "Sample Title 1", price: 10 },
      { _id: "sample-2", title: "Sample Title 2", price: 20 },
      { _id: "sample-3", title: "Sample Title 3", price: 30 },
    ]);
  });

  it("gives a bound table the resource's listed columns and only the display options a mockup table takes", () => {
    const table = nodeNamed(convert(EVERY_ROW).page.tree, "table");

    expect(table.options).to.deep.equal({
      caption: "Books",
      pageSize: 20,
      fetchUrl: "fixture:rows-api-book-list",
      columns: {
        title: { name: "Title", type: "string", sortable: true },
        price: { name: "price", type: "number" },
      },
    });
  });

  it("records the live page it was converted from", () => {
    const { page } = convert([]);

    expect(page).to.deep.equal({
      id: "books",
      title: "Page /books",
      livePage: { ref: REF, version: "0123456789abcdef" },
      tree: [],
    });
  });
});

describe("[unit] mockup conversion of a block's live route", () => {
  function convertRoute(route: string): ConvertedPage {
    return convert([
      { name: "kpi", type: "KpiCard", config: { title: "K", fetchUrl: route } },
    ]);
  }

  it("sketches a bound table whose resource's list route is not a relative route", () => {
    const resource = { ...BOOK_RESOURCE, route: "/api/my books" };
    const converted = convertPage(
      structureOf(REF, [
        { name: "table", type: "TableView", controller: "book", config: {} },
      ]),
      "books",
      {
        oracle: openOracle(NAME, "books"),
        resources: new Map([[resource.ref, resource]]),
      },
    );

    expect(converted.sketches).to.deep.equal([
      { path: "/books#table", reason: "remote-route" },
    ]);
    expect(converted.page).not.to.have.property("liveRoutes");
    expect(issuesOf(converted)).to.deep.equal([]);
  });

  it("sketches a block whose route is not a relative route, never keeps it as a live route", () => {
    for (const route of REFUSED_ROUTES) {
      const converted = convertRoute(route);

      expect(converted.sketches, JSON.stringify(route)).to.deep.equal([
        { path: "/books#kpi", reason: "remote-route" },
      ]);
      expect(converted.page).not.to.have.property("liveRoutes");
      expect(issuesOf(converted)).to.deep.equal([]);
    }
  });

  it("keeps a block's route that is a relative route as a live route the spec reads back", () => {
    for (const route of ACCEPTED_ROUTES) {
      const converted = convertRoute(route);

      expect(converted.sketches, JSON.stringify(route)).to.deep.equal([]);
      expect(Object.values(converted.page.liveRoutes ?? {})).to.deep.equal([
        route,
      ]);
      expect(issuesOf(converted), JSON.stringify(route)).to.deep.equal([]);
    }
  });
});
