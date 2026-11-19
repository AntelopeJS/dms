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

const DEMO = mockupNameSchema.parse("demo");

const ORDERS = [
  { _id: "o1", customer: "Acme", total: 120 },
  { _id: "o2", customer: "Brightline", total: 480 },
];

const COLUMNS = {
  customer: { type: "string" },
  total: { type: "number" },
};

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function navCard(to: string): JsonObject {
  return {
    type: "NavCardGrid",
    options: { items: [{ title: "Go", icon: "i-ph-arrow-right", to }] },
  };
}

const navCardSchema = z.object({
  items: z.array(z.object({ to: z.string() })),
});

function navCardLink(compiled: CompiledSpec, page: number): string {
  return navCardSchema.parse(compiled.pages[page].tree[0].options).items[0].to;
}

const customActionSchema = z.object({
  rowActions: z.object({
    custom: z.array(z.object({ target: z.object({ url: z.string() }) })),
  }),
});

function tableWithAction(url: string, rowIdKey?: string): JsonObject {
  const options: JsonObject = {
    caption: "Orders",
    fetchUrl: "fixture:orders",
    columns: COLUMNS,
    rowActions: {
      custom: [{ label: "Open", target: { type: "page", url } }],
    },
  };
  if (rowIdKey !== undefined) options.rowIdKey = rowIdKey;
  return { type: "TableView", options };
}

function issuePaths(spec: Json): string[] {
  const read = parseSpec(JSON.stringify(spec));
  return read.ok ? [] : read.issues.map((issue) => issue.path);
}

describe("[unit] mockup page links", () => {
  it("rewrites a page:<id> link at any depth to the viewer's URL of that page and lists the page among the links (fails when a link stays as written)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        { id: "home", title: "Home", tree: [navCard("page:orders")] },
        { id: "orders", title: "Orders", tree: [] },
      ],
    });

    expect(compiled.issues).to.deep.equal([]);
    expect(navCardLink(compiled, 0)).to.equal("/mockup?name=demo&page=orders");
    expect(compiled.pages.map((page) => page.links)).to.deep.equal([
      ["orders"],
      [],
    ]);
  });

  it("reports a link to a page the spec lacks at the link's pointer (fails when an unknown page is accepted)", () => {
    const compiled = compile({
      version: 1,
      pages: [{ id: "home", title: "Home", tree: [navCard("page:nowhere")] }],
    });

    expect(compiled.issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/0/options/items/0/to",
    ]);
    expect(compiled.pages[0].links).to.deep.equal([]);
  });

  it("passes a table row's id, read at its rowIdKey, from a row action to a page with a route, and none to a page without (fails when the row is dropped)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: { orders: ORDERS },
          tree: [
            tableWithAction("page:order"),
            tableWithAction("page:report", "customer"),
            tableWithAction("page:order", "customer"),
          ],
        },
        {
          id: "order",
          title: "Order",
          menu: false,
          parent: "orders",
          route: ":id",
          tree: [],
        },
        { id: "report", title: "Report", tree: [] },
      ],
    });
    const urls = compiled.pages[0].tree.map(
      (node) =>
        customActionSchema.parse(node.options).rowActions.custom[0].target.url,
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(urls).to.deep.equal([
      "/mockup?name=demo&page=order&record={{row._id}}",
      "/mockup?name=demo&page=report",
      "/mockup?name=demo&page=order&record={{row.customer}}",
    ]);
    expect(compiled.pages[0].links).to.deep.equal(["order", "report"]);
  });

  it("keeps a link on a page drawn on its fixtures alone, under a key a block requests (fails when the link is confined to an error route)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: { orders: ORDERS },
          tree: [tableWithAction("page:report")],
        },
        { id: "report", title: "Report", tree: [] },
      ],
    });
    const url = customActionSchema.parse(compiled.pages[0].tree[0].options)
      .rowActions.custom[0].target.url;

    expect(url).to.equal("/mockup?name=demo&page=report");
  });
});

describe("[unit] mockup sub-pages", () => {
  it("carries menu, parent and route into the compiled page, the route with the first row of the parent's rows it reads (fails when they are dropped)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: { orders: ORDERS },
          tree: [],
        },
        {
          id: "order",
          title: "Order",
          menu: false,
          parent: "orders",
          route: ":id",
          tree: [
            {
              type: "ResourceForm",
              options: {
                fetchUrl: "fixture:orders",
                fields: [{ id: "customer", name: "Customer", type: "string" }],
              },
            },
          ],
        },
      ],
    });
    const [orders, order] = compiled.pages;

    expect(compiled.issues).to.deep.equal([]);
    expect(orders).to.not.have.property("menu");
    expect(orders).to.not.have.property("route");
    expect(order).to.include({ menu: false, parent: "orders" });
    expect(order.route).to.deep.equal({ param: "id", sample: "o1" });
    expect(order.tree[0].options?.fetchUrl).to.equal(
      "/api/mockup/demo/pages/orders/fixtures/orders/record?id={{params.id}}",
    );
  });

  it("reads a fixture the sub-page lacks from its nearest ancestor holding it, whole when the page has no route (fails when it is reported missing)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: { orders: ORDERS, revenue: { value: 9 } },
          tree: [],
        },
        {
          id: "stats",
          title: "Stats",
          parent: "orders",
          tree: [
            {
              type: "KpiCard",
              options: { title: "Revenue", fetchUrl: "fixture:revenue" },
            },
          ],
        },
      ],
    });

    expect(compiled.issues).to.deep.equal([]);
    expect(compiled.pages[1].tree[0].options?.fetchUrl).to.equal(
      "/api/mockup/demo/pages/orders/fixtures/revenue",
    );
  });

  it("writes no route token into a link off a table row, which a block's link cannot fill in the preview: the viewer passes the page's own row (fails when a {{params}} token reaches the link)", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: { orders: ORDERS },
          tree: [],
        },
        {
          id: "order",
          title: "Order",
          parent: "orders",
          route: ":id",
          tree: [navCard("page:order-edit")],
        },
        {
          id: "order-edit",
          title: "Edit order",
          parent: "order",
          route: ":id",
          tree: [],
        },
      ],
    });

    expect(navCardLink(compiled, 1)).to.equal(
      "/mockup?name=demo&page=order-edit",
    );
  });
});

describe("[unit] mockup sub-page checks", () => {
  it("refuses a parent no page has, a loop of parents and a route without a parent, each at its pointer (fails when one is accepted)", () => {
    expect(
      issuePaths({
        version: 1,
        pages: [
          { id: "a", title: "A", parent: "b", tree: [] },
          { id: "b", title: "B", parent: "a", tree: [] },
          { id: "c", title: "C", parent: "nowhere", tree: [] },
          { id: "d", title: "D", route: ":id", tree: [] },
          { id: "e", title: "E", parent: "e", tree: [] },
        ],
      }),
    ).to.deep.equal([
      "/pages/0/parent",
      "/pages/1/parent",
      "/pages/2/parent",
      "/pages/3/route",
      "/pages/4/parent",
    ]);
    expect(
      issuePaths({
        version: 1,
        pages: [
          { id: "a", title: "A", tree: [] },
          { id: "b", title: "B", parent: "a", route: "id", tree: [] },
        ],
      }),
    ).to.deep.equal(["/pages/1/route"]);
  });
});
