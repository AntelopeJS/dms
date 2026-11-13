import { expect } from "chai";
import { z } from "zod";
import {
  compileSpec,
  type ConvertedPage,
  convertPage,
  type Json,
  type MockupNode,
  mockupNameSchema,
  jsonObjectSchema,
  openOracle,
  parseSpec,
  slugOf,
} from "../../../mockup";
import {
  BOOK_RESOURCE,
  type BlockDraft,
  structureOf,
} from "../../helpers/live-page";

const NAME = mockupNameSchema.parse("books");

function convert(blocks: BlockDraft[]): ConvertedPage {
  return convertPage(structureOf("/books", blocks), "books", {
    oracle: openOracle(NAME, "books"),
    resources: new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]),
  });
}

function compiled(converted: ConvertedPage) {
  const read = parseSpec(
    JSON.stringify({ version: 1, pages: [converted.page] }),
  );
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(NAME, read.spec);
}

/** Every string option named `*Url`, at any depth, as `key=value`. */
function urlOptionsIn(value: Json | readonly MockupNode[]): string[] {
  if (Array.isArray(value)) return value.flatMap(urlOptionsIn);
  const object = jsonObjectSchema.safeParse(value);
  if (!object.success) return [];
  return Object.entries(object.data).flatMap(([key, entry]) => {
    const route = z.string().safeParse(entry);
    return key.endsWith("Url") && route.success
      ? [`${key}=${route.data}`]
      : urlOptionsIn(entry);
  });
}

const HOSTILE_NAMES = [
  "<script>alert(1)</script>",
  "javascript:alert(1)",
  "url(https://evil.test)",
  "@import 'x'",
  'onload="x"',
  "é".repeat(10_000),
];

describe("[unit] mockup conversion guarantees", () => {
  it("draws a sketch whatever the block's name or type is called, so the spec always compiles", () => {
    const converted = convert(
      HOSTILE_NAMES.map((name) => ({ name, type: null })),
    );
    const { issues } = compiled(converted);

    expect(issues).to.deep.equal([]);
    for (const node of converted.page.tree) {
      expect(node.type).to.equal("sketch");
      expect(z.string().parse(node.options?.html)).to.contain("<b>block</b>");
    }
  });

  it("converts the same page to the same spec every time", () => {
    const blocks: BlockDraft[] = [
      {
        name: "a",
        type: "KpiCard",
        config: { title: "A", fetchUrl: "/api/a/b-c" },
      },
      {
        name: "b",
        type: "KpiCard",
        config: { title: "B", fetchUrl: "/api/a-b/c" },
      },
      {
        name: "c",
        type: "KpiCard",
        config: { title: "C", fetchUrl: "/api/a/b-c" },
      },
      { name: "t", type: "TableView", controller: "book", config: {} },
    ];

    expect(convert(blocks)).to.deep.equal(convert(blocks));
  });
});

describe("[unit] mockup conversion guarantees on routes", () => {
  it("gives two routes that slug alike two fixtures, and one route read twice one fixture", () => {
    const { page } = convert([
      {
        name: "a",
        type: "KpiCard",
        config: { title: "A", fetchUrl: "/api/a/b-c" },
      },
      {
        name: "b",
        type: "KpiCard",
        config: { title: "B", fetchUrl: "/api/a-b/c" },
      },
      {
        name: "c",
        type: "KpiCard",
        config: { title: "C", fetchUrl: "/api/a/b-c" },
      },
    ]);

    expect(page.tree.map((node) => node.options?.fetchUrl)).to.deep.equal([
      "fixture:api-a-b-c",
      "fixture:api-a-b-c-2",
      "fixture:api-a-b-c",
    ]);
    expect(page.liveRoutes).to.deep.equal({
      "api-a-b-c": "/api/a/b-c",
      "api-a-b-c-2": "/api/a-b/c",
    });
  });

  it("calls no live route with Real data off: every *Url option of the sample tree is a mockup fixture", () => {
    const state = compiled(
      convert([
        {
          name: "kpi",
          type: "KpiCard",
          config: { title: "K", fetchUrl: "/api/kpi" },
        },
        { name: "table", type: "TableView", controller: "book", config: {} },
        {
          name: "card",
          type: "ChartCard",
          config: {
            title: "C",
            fetchUrl: "/api/card",
            chart: { $block: { type: "ChartLine", config: {} } },
          },
        },
        {
          name: "tabs",
          type: "Tab",
          config: {
            badgesUrl: "/api/books/counts",
            items: [{ slot: "a", label: "A" }],
          },
        },
        {
          name: "form",
          type: "Form",
          config: {
            title: "New book",
            fetchUrl: "/api/books/get",
            submitUrl: "/api/books/create",
            saveMode: "instant",
            submitDefaults: { hooks: [{ callbackUrl: "/api/books/hook" }] },
          },
        },
      ]),
    );
    const [page] = state.pages;
    const fixture = "/api/mockup/books/pages/books/fixtures";

    expect(state.issues).to.deep.equal([]);
    expect(urlOptionsIn(page.tree)).to.deep.equal([
      `fetchUrl=${fixture}/api-kpi`,
      `fetchUrl=${fixture}/rows-api-book-list/rows`,
      `fetchUrl=${fixture}/api-card`,
      `badgesUrl=${fixture}/api-books-counts`,
      `fetchUrl=${fixture}/api-books-get`,
      `submitUrl=${fixture}/api-books-create`,
      `callbackUrl=${fixture}/api-books-hook`,
    ]);
    expect(urlOptionsIn(page.realTree ?? [])).to.deep.equal([
      "fetchUrl=/api/kpi",
      "fetchUrl=/api/book/list",
      "fetchUrl=/api/card",
      "badgesUrl=/api/books/counts",
      "fetchUrl=/api/books/get",
      "submitUrl=/api/books/create",
      "callbackUrl=/api/books/hook",
    ]);
  });
});

describe("[unit] mockup conversion guarantees on routes it cannot keep", () => {
  it("sketches a block whose *Url option leaves the site, never one whose route is templated", () => {
    const converted = convert([
      {
        name: "tabs",
        type: "Tab",
        config: {
          badgesUrl: "/api/counts/{{params.id}}",
          items: [{ slot: "a", label: "A" }],
        },
        children: [{ name: "note", type: "Banner", slot: "a", config: {} }],
      },
      {
        name: "form",
        type: "Form",
        config: { title: "F", submitUrl: "https://example.com/create" },
      },
    ]);
    const [page] = compiled(converted).pages;

    expect(converted.sketches).to.deep.equal([
      { path: "/books#form", reason: "remote-route" },
    ]);
    expect(converted.page.tree.map((node) => node.type)).to.deep.equal([
      "Tab",
      "sketch",
    ]);
    expect(urlOptionsIn(page.tree)).to.deep.equal([
      "badgesUrl=/api/mockup/books/pages/books/fixtures/api-counts-params-id",
    ]);
    expect(urlOptionsIn(page.realTree ?? [])).to.deep.equal([
      "badgesUrl=/api/counts/{{params.id}}",
    ]);
    expect(compiled(converted).issues).to.deep.equal([]);
  });

  it("keeps no fixture nor live route of a block that ended up inside a sketch", () => {
    const { page } = convert([
      {
        name: "layout",
        type: "Grid",
        children: [
          {
            name: "kpi",
            type: "KpiCard",
            config: { title: "K", fetchUrl: "/api/kpi" },
          },
        ],
      },
    ]);

    expect(page.tree[0]?.type).to.equal("sketch");
    expect(page).not.to.have.property("liveRoutes");
    expect(page).not.to.have.property("fixtures");
  });

  it("names a mockup after the page's route, never a name the mockup API reserves", () => {
    expect(
      ["/books", "/", "/Blocks/Customers/:id", "/schema"].map(slugOf),
    ).to.deep.equal(["books", "home", "blocks-customers-id", "schema-page"]);
  });
});
