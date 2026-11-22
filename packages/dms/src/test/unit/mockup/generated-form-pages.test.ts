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

const LIST = "/mockup?name=demo&page=orders";

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const table = (options: JsonObject): JsonObject => ({
  type: "TableView",
  options: {
    caption: "Orders",
    fetchUrl: "fixture:orders",
    columns: {
      customer: { name: "Customer", type: "string", order: 1 },
      total: { name: "Total", type: "number", order: 2 },
    },
    rowActions: { add: true, edit: true, details: true },
    formContainer: { type: "page" },
    ...options,
  },
});

const specOf = (tables: JsonObject[], extra: Json[] = []): Json => ({
  version: 1,
  pages: [
    {
      id: "orders",
      title: "Orders",
      fixtures: { orders: ORDERS },
      tree: tables,
    },
    ...extra,
  ],
});

const formNodeSchema = z.object({
  options: z
    .object({
      fields: z.array(
        z.object({ id: z.string(), disabled: z.boolean().optional() }),
      ),
      fetchUrl: z.string().optional(),
      submitUrl: z.string().optional(),
      backTo: z.string().optional(),
      redirectOnSuccess: z.string().optional(),
    })
    .passthrough(),
});

function generated(compiled: CompiledSpec, kind: string) {
  const page = compiled.pages.find((entry) => entry.id.endsWith(`.${kind}`));
  if (!page) throw new Error(`no generated ${kind} page`);
  return { page, form: formNodeSchema.parse(page.tree.at(-1)) };
}

describe("[unit] mockup generated form pages", () => {
  it("draws the add, edit and details forms of a page-mode table with no custom pages on generated sub-pages of the table's page (fails when the mockup demands a spec page)", () => {
    const compiled = compile(specOf([table({})]));
    const urls = z
      .object({ formPages: z.record(z.string(), z.string()) })
      .parse(compiled.pages[0].tree[0].options).formPages;

    expect(compiled.issues).to.deep.equal([]);
    expect(urls).to.deep.equal({
      new: "/mockup?name=demo&page=orders.tree-0.new",
      edit: "/mockup?name=demo&page=orders.tree-0.edit&record=:id",
      view: "/mockup?name=demo&page=orders.tree-0.view&record=:id",
    });
    expect(compiled.pages.map((page) => page.id)).to.deep.equal([
      "orders",
      "orders.tree-0.new",
      "orders.tree-0.edit",
      "orders.tree-0.view",
    ]);
    for (const page of compiled.pages.slice(1)) {
      expect(page).to.deep.include({
        generated: true,
        menu: false,
        parent: "orders",
      });
    }
  });

  it("keeps generated pages out of the table page's links, so the Overview draws no arrow to them", () => {
    const compiled = compile(specOf([table({})]));

    expect(compiled.pages[0].links).to.deep.equal([]);
  });

  it("shows the generated form over the table's columns, going back to the table, and leaving for it once saved (fails when backTo or the redirect is left out)", () => {
    const compiled = compile(specOf([table({})]));
    const add = generated(compiled, "new");
    const edit = generated(compiled, "edit");

    expect(add.form.options.fields.map((field) => field.id)).to.deep.equal([
      "customer",
      "total",
    ]);
    expect(add.form.options).to.deep.include({
      backTo: LIST,
      redirectOnSuccess: LIST,
      submitUrl: "/api/mockup/demo/pages/orders/fixtures/orders/rows",
    });
    expect(edit.form.options).to.deep.include({
      backTo: LIST,
      redirectOnSuccess: LIST,
      fetchUrl:
        "/api/mockup/demo/pages/orders/fixtures/orders/record?id={{params.id}}",
    });
    expect(edit.page.route).to.deep.equal({ param: "id", sample: "o1" });
    expect(add.page.route).to.equal(undefined);
  });

  it("draws the details page read-only: every field disabled, nothing saved, no redirect (fails when the details form is editable)", () => {
    const view = generated(compile(specOf([table({})])), "view");

    expect(view.form.options.fields.every((field) => field.disabled)).to.equal(
      true,
    );
    expect(view.form.options.backTo).to.equal(LIST);
    expect(view.form.options).to.not.have.property("redirectOnSuccess");
    expect(view.page.route).to.deep.equal({ param: "id", sample: "o1" });
  });

  it("opens the read-only details page on a back link to the table, which has no Cancel to go back with (fails when the details page has no way back)", () => {
    const compiled = compile(specOf([table({})]));
    const view = generated(compiled, "view").page;
    const back = z
      .object({
        options: z.object({
          items: z.array(z.object({ to: z.string() })).length(1),
        }),
      })
      .parse(view.tree[0]);

    expect(view.tree).to.have.length(2);
    expect(back.options.items[0].to).to.equal(LIST);
    expect(generated(compiled, "edit").page.tree).to.have.length(1);
    expect(compiled.issues).to.deep.equal([]);
  });

  it("titles each page by its formContainer.pages entry, else the generic text (fails when displayName and description are ignored)", () => {
    const compiled = compile(
      specOf([
        table({
          formContainer: {
            type: "page",
            pages: {
              new: { displayName: "New order", description: "Take an order." },
            },
          },
        }),
      ]),
    );

    expect(generated(compiled, "new").page).to.deep.include({
      title: "New order",
      description: "Take an order.",
    });
    expect(generated(compiled, "edit").page).to.deep.include({
      title: "Edit entry",
      description: "Change its fields, then save.",
    });
    expect(generated(compiled, "view").page.title).to.equal("Entry details");
  });

  it("titles a page left without an entry in English, never as the i18n key the real table leaves to the locale (fails when a key reaches the page header)", () => {
    const compiled = compile(specOf([table({})]));

    for (const page of compiled.pages.slice(1)) {
      expect(page.title).to.not.match(/^\$/);
      expect(page.description).to.not.match(/^\$/);
    }
    expect(generated(compiled, "new").page).to.deep.include({
      title: "New entry",
      description: "Fill in its fields, then save.",
    });
  });
});

describe("[unit] mockup generated form pages beside others", () => {
  it("draws a generated page beside a custom one, each form on its own, with the generated pages inheriting the table page's options", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          options: { theme: "dark" },
          fixtures: { orders: ORDERS },
          tree: [
            table({
              formContainer: {
                type: "page",
                pages: {
                  edit: { urlSlug: "page:order-edit", customPage: true },
                },
              },
            }),
          ],
        },
        {
          id: "order-edit",
          title: "Edit",
          parent: "orders",
          route: ":id",
          menu: false,
          tree: [],
        },
      ],
    });
    const urls = z
      .object({ formPages: z.record(z.string(), z.string()) })
      .parse(compiled.pages[0].tree[0].options).formPages;

    expect(compiled.issues).to.deep.equal([]);
    expect(urls.edit).to.equal("/mockup?name=demo&page=order-edit&record=:id");
    expect(urls.new).to.equal("/mockup?name=demo&page=orders.tree-0.new");
    expect(compiled.pages.map((page) => page.id)).to.deep.equal([
      "orders",
      "order-edit",
      "orders.tree-0.new",
      "orders.tree-0.view",
    ]);
    expect(generated(compiled, "new").page.options).to.deep.equal({
      theme: "dark",
    });
  });

  it("gives each table of a page generated pages of its own (fails when two tables share an id)", () => {
    const compiled = compile(
      specOf([table({}), { type: "Grid", children: [table({})] }]),
    );
    const ids = compiled.pages.map((page) => page.id);

    expect(new Set(ids).size).to.equal(ids.length);
    expect(ids).to.include("orders.tree-0.new");
    expect(ids).to.include("orders.tree-1-children-0.new");
  });

  it("reads the sample row of a page at the table's rowIdKey", () => {
    const compiled = compile({
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          fixtures: {
            orders: [
              { _id: "o1", ref: "A-1", customer: "Acme", total: 1 },
              { _id: "o2", ref: "A-2", customer: "Brightline", total: 2 },
            ],
          },
          tree: [table({ rowIdKey: "ref" })],
        },
      ],
    });

    expect(generated(compiled, "edit").page.route?.sample).to.equal("A-1");
  });
});
