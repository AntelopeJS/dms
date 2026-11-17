import { expect } from "chai";
import { z } from "zod";
import {
  type CompiledSpec,
  compileSpec,
  mockupNameSchema,
  type MockupNode,
  type MockupSpec,
  type MockupSpecPage,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

const ROWS = [{ title: "Sample 1", price: 10 }];

function linkedPage(extra: Partial<MockupSpecPage> = {}): MockupSpecPage {
  return {
    id: "books",
    title: "Books",
    livePage: { ref: "/books", version: "9f2c1a7b3d0e4a55" },
    liveRoutes: {
      "api-books-revenue": "/api/books/stats/revenue",
      "rows-api-books-list": "/api/books/list",
    },
    fixtures: { "api-books-revenue": null, "rows-api-books-list": ROWS },
    tree: [
      {
        id: "revenue",
        type: "KpiCard",
        options: { title: "Revenue", fetchUrl: "fixture:api-books-revenue" },
      },
      {
        id: "table",
        type: "TableView",
        options: {
          fetchUrl: "fixture:rows-api-books-list",
          columns: { title: { name: "Title", type: "string" } },
        },
      },
    ],
    ...extra,
  };
}

function compile(spec: MockupSpec): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const kpiSchema = z.object({ options: z.object({ fetchUrl: z.string() }) });
const tableSchema = z.object({
  options: z.object({ source: z.object({ fetchUrl: z.string() }) }),
});

function urlsOf(tree: readonly MockupNode[] | undefined): string[] {
  if (!tree) return [];
  return [
    kpiSchema.parse(tree[0]).options.fetchUrl,
    tableSchema.parse(tree[1]).options.source.fetchUrl,
  ];
}

describe("[unit] mockup Real data", () => {
  it("compiles a linked page twice: fixtures in tree, live routes in realTree, one set of paths", () => {
    const compiled = compile({ version: 1, pages: [linkedPage()] });
    const [page] = compiled.pages;

    expect(compiled.issues).to.deep.equal([]);
    expect(urlsOf(page.tree)).to.deep.equal([
      "/api/mockup/demo/pages/books/fixtures/api-books-revenue",
      "/api/mockup/demo/pages/books/fixtures/rows-api-books-list/rows",
    ]);
    expect(urlsOf(page.realTree)).to.deep.equal([
      "/api/books/stats/revenue",
      "/api/books/list",
    ]);
    expect(page.paths).to.deep.equal({
      "block-0": "/pages/0/tree/0",
      "block-1": "/pages/0/tree/1",
    });
    expect(page.livePage).to.deep.equal({ ref: "/books" });
  });

  it("gives a page with no live routes no real tree, so a hand-made mockup reads its fixtures alone", () => {
    const { liveRoutes: _routes, livePage: _page, ...handMade } = linkedPage();
    const [page] = compile({ version: 1, pages: [handMade] }).pages;

    expect(page.realTree).to.equal(undefined);
    expect(page.livePage).to.equal(undefined);
    expect(urlsOf(page.tree)).to.deep.equal([
      "/api/mockup/demo/pages/books/fixtures/api-books-revenue",
      "/api/mockup/demo/pages/books/fixtures/rows-api-books-list/rows",
    ]);
  });

  it("reads a key the live routes do not name from its fixture, even under Real data", () => {
    const page = linkedPage({
      liveRoutes: { "api-books-revenue": "/api/books/stats/revenue" },
    });
    const [compiled] = compile({ version: 1, pages: [page] }).pages;

    expect(urlsOf(compiled.realTree)).to.deep.equal([
      "/api/books/stats/revenue",
      "/api/mockup/demo/pages/books/fixtures/rows-api-books-list/rows",
    ]);
  });

  it("refuses a live route that leaves the site, and a livePage on the envelope", () => {
    for (const route of ["https://evil.test/x", "//evil.test/x", "/\\evil"]) {
      const read = parseSpec(
        JSON.stringify({
          version: 1,
          pages: [linkedPage({ liveRoutes: { k: route } })],
        }),
      );
      expect(read.ok, route).to.equal(false);
    }
    const envelope = parseSpec(
      JSON.stringify({
        version: 1,
        livePage: { ref: "/books", version: "1" },
        pages: [linkedPage()],
      }),
    );
    expect(envelope.ok).to.equal(false);
  });

  it("refuses a live route with a control character, which a URL parser drops to leave the site", () => {
    const routes = [
      "/\t/evil.example/steal",
      "/\n/evil.example/steal",
      "/\r/evil.example/steal",
      "/api/\u0000books",
      "/api/books\u007f",
    ];

    for (const route of routes) {
      const read = parseSpec(
        JSON.stringify({
          version: 1,
          pages: [linkedPage({ liveRoutes: { k: route } })],
        }),
      );
      expect(read.ok, JSON.stringify(route)).to.equal(false);
    }
  });

  it("still takes a live route with a query, an encoded space and a non-ASCII letter", () => {
    const read = parseSpec(
      JSON.stringify({
        version: 1,
        pages: [
          linkedPage({
            liveRoutes: { k: "/api/books?title=a%20b&q=café" },
          }),
        ],
      }),
    );

    expect(read.ok).to.equal(true);
  });
});
