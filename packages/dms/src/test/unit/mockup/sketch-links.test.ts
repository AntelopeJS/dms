import { expect } from "chai";
import { z } from "zod";
import {
  type CompiledSpec,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import { sketchRefusals } from "../../../mockup/sketch";

const DEMO = mockupNameSchema.parse("demo");

const ORDERS = [
  { _id: "o1", customer: "Acme" },
  { _id: "o2", customer: "Brightline" },
];

function compile(pages: Json[]): CompiledSpec {
  const read = parseSpec(JSON.stringify({ version: 1, pages }));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function sketchPage(id: string, html: string, extra: JsonObject = {}): Json {
  return {
    id,
    title: id,
    ...extra,
    tree: [{ type: "sketch", options: { html } }],
  };
}

const page = (id: string, extra: JsonObject = {}): JsonObject => ({
  id,
  title: id,
  ...extra,
  tree: [],
});

const sketchOptionsSchema = z.object({ html: z.string() }).passthrough();

function drawnHtml(compiled: CompiledSpec, index = 0): string {
  return sketchOptionsSchema.parse(compiled.pages[index].tree[0].options).html;
}

const issuePaths = (compiled: CompiledSpec) =>
  compiled.issues.map((issue) => issue.path);

describe("[unit] mockup sketch links", () => {
  it("draws a page:<id> link to the viewer's URL of that page, opened in the window holding the dashboard, and lists the page among the page's links (fails when the link is kept, refused or left in the frame)", () => {
    const compiled = compile([
      sketchPage(
        "home",
        '<a class="cta" href="page:orders">Orders</a><a href="#top">Top</a>',
      ),
      page("orders"),
    ]);

    expect(compiled.issues).to.deep.equal([]);
    expect(drawnHtml(compiled)).to.equal(
      '<a href="/mockup?name=demo&amp;page=orders" target="_top" class="cta">Orders</a><a href="#top">Top</a>',
    );
    expect(compiled.pages[0].links).to.deep.equal(["orders"]);
  });

  it("passes the row on screen, as a route token, only to a sub-page of the page that takes a row too (fails when every link or none carries it)", () => {
    const compiled = compile([
      { ...page("orders"), fixtures: { orders: ORDERS } },
      sketchPage(
        "order",
        '<a href="page:order-edit">Edit</a><a href="page:orders">Back</a>',
        { parent: "orders", route: ":id" },
      ),
      page("order-edit", { parent: "order", route: ":id" }),
    ]);

    expect(compiled.issues).to.deep.equal([]);
    expect(drawnHtml(compiled, 1)).to.equal(
      '<a href="/mockup?name=demo&amp;page=order-edit&amp;record={{params.id}}" target="_top">Edit</a><a href="/mockup?name=demo&amp;page=orders" target="_top">Back</a>',
    );
  });

  it("reports a link to a page the spec lacks at the sketch's html, naming the pages, and still draws it (fails when it is dropped silently)", () => {
    const compiled = compile([
      sketchPage("home", '<a href="page:missing">Gone</a>'),
    ]);

    expect(compiled.issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/options/html",
        message: 'no page has the id "missing": the pages are home',
      },
    ]);
    expect(drawnHtml(compiled)).to.equal(
      '<a href="/mockup?name=demo&amp;page=missing" target="_top">Gone</a>',
    );
    expect(compiled.pages[0].links).to.deep.equal([]);
  });

  it("refuses any other link: a site, a viewer URL written by hand, an id that is no page id, a target of its own, and a page link on an SVG <a> (fails when one is drawn)", () => {
    const sketches = [
      '<a href="https://example.com">x</a>',
      '<a href="/mockup?name=demo&amp;page=orders">x</a>',
      '<a href="page:Not An Id">x</a>',
      '<a href="page:orders" target="_blank">x</a>',
      '<svg><a href="page:orders"><text>x</text></a></svg>',
    ];
    const compiled = compile([
      ...sketches.map((html, index) => sketchPage(`p${index}`, html)),
      page("orders"),
    ]);

    expect(issuePaths(compiled)).to.deep.equal(
      sketches.map((_, index) => `/pages/${index}/tree/0/options/html`),
    );
    expect(
      sketches.map((_, index) => drawnHtml(compiled, index)),
    ).to.deep.equal(sketches.map(() => ""));
  });

  it("keeps refusing a page: link where no page links are taken, as the block preview tool checks a sketch (fails when every check takes them)", () => {
    expect(
      sketchRefusals({ html: '<a href="page:orders">x</a>' }),
    ).to.deep.equal(["a href on <a> that is not an #anchor"]);
  });

  it("refuses a script, an event handler and a javascript: URL in a sketch with page links, drawing none of it (fails when a linked sketch skips the check)", () => {
    const sketches = [
      '<a href="page:orders">x</a><script>alert(1)</script>',
      '<a href="page:orders" onclick="alert(1)">x</a>',
      '<a href="javascript:alert(1)">x</a><a href="page:orders">y</a>',
    ];
    const compiled = compile([
      ...sketches.map((html, index) => sketchPage(`p${index}`, html)),
      page("orders"),
    ]);

    expect(issuePaths(compiled)).to.deep.equal(
      sketches.map((_, index) => `/pages/${index}/tree/0/options/html`),
    );
    expect(
      sketches.map((_, index) => drawnHtml(compiled, index)),
    ).to.deep.equal(sketches.map(() => ""));
  });
});
