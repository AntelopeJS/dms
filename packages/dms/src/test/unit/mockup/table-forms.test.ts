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

const ROWS = "/api/mockup/demo/pages/orders/fixtures/orders/rows";
const RECORD = "/api/mockup/demo/pages/orders/fixtures/orders/record";

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function table(options: JsonObject): JsonObject {
  return {
    type: "TableView",
    options: {
      caption: "Orders",
      fetchUrl: "fixture:orders",
      columns: {
        customer: { name: "Customer", type: "string", order: 1 },
        total: { name: "Total", type: "number", order: 2 },
      },
      ...options,
    },
  };
}

function specWith(options: JsonObject, extraPages: Json[] = []): Json {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        fixtures: { orders: ORDERS },
        tree: [table(options)],
      },
      ...extraPages,
    ],
  };
}

const formSchema = z.object({
  options: z
    .object({
      fields: z.array(z.object({ id: z.string(), label: z.string() })),
      fetchUrl: z.string().optional(),
      submitUrl: z.string(),
    })
    .passthrough(),
});

const tableFormsSchema = z.object({
  rowActions: z.object({
    add: z.unknown(),
    edit: z.unknown(),
    details: z.unknown(),
  }),
  formContainer: z.object({ type: z.string() }),
  formComponents: z
    .object({ new: formSchema.optional(), edit: formSchema.optional() })
    .optional(),
  formPages: z
    .object({ new: z.string(), edit: z.string(), view: z.string() })
    .optional(),
});

function tableOf(compiled: CompiledSpec) {
  return tableFormsSchema.parse(compiled.pages[0].tree[0].options);
}

const subPage = (id: string, route?: string): JsonObject => ({
  id,
  title: id,
  menu: false,
  parent: "orders",
  ...(route !== undefined && { route }),
  tree: [],
});

const pageForm = (id: string): JsonObject => ({
  urlSlug: `page:${id}`,
  customPage: true,
});

describe("[unit] mockup table forms", () => {
  it("turns a table's add and edit on, in a modal by default, with forms over its columns that read the row and save to its rows route (fails when fromSource keeps them off)", () => {
    const compiled = compile(
      specWith({ rowActions: { add: true, edit: true } }),
    );
    const built = tableOf(compiled);

    expect(compiled.issues).to.deep.equal([]);
    expect(built.rowActions.add).to.equal(true);
    expect(built.rowActions.edit).to.equal(true);
    expect(built.formContainer).to.deep.equal({ type: "modal" });
    expect(built.formComponents?.new?.options).to.deep.include({
      submitUrl: ROWS,
    });
    expect(built.formComponents?.new?.options.fetchUrl).to.equal(undefined);
    expect(built.formComponents?.edit?.options).to.deep.include({
      fetchUrl: `${RECORD}?id={{params.id}}`,
      submitUrl: `${ROWS}?id={{params.id}}`,
    });
    expect(
      JSON.stringify(built.formComponents),
      "the preview refuses a block naming a method that writes",
    ).to.not.match(/UrlMethod/i);
    expect(
      built.formComponents?.new?.options.fields.map((field) => field.label),
    ).to.deep.equal(["Customer", "Total"]);
  });

  it("reads and saves an edit form's row at the table's rowIdKey, in the drawer formContainer asks for", () => {
    const built = tableOf(
      compile(
        specWith({
          rowIdKey: "customer",
          rowActions: { edit: true },
          formContainer: { type: "drawer" },
        }),
      ),
    );

    expect(built.formContainer).to.deep.equal({ type: "drawer" });
    expect(built.formComponents?.new).to.equal(undefined);
    expect(built.formComponents?.edit?.options).to.deep.include({
      fetchUrl: `${RECORD}?id={{params.id}}&key=customer`,
      submitUrl: `${ROWS}?id={{params.id}}&key=customer`,
    });
    expect(
      built.formComponents?.edit?.options.fields.map((field) => field.id),
    ).to.deep.equal(["total"]);
  });

  it("opens the add, edit and details forms of a page-mode table on the spec pages it names, the row's id passed to the edit and details pages (fails when formPages are left out)", () => {
    const compiled = compile(
      specWith(
        {
          rowActions: { add: true, edit: true, details: true },
          formContainer: {
            type: "page",
            pages: {
              new: pageForm("order-new"),
              edit: pageForm("order-edit"),
              details: pageForm("order"),
            },
          },
        },
        [
          subPage("order-new"),
          subPage("order-edit", ":id"),
          subPage("order", ":id"),
        ],
      ),
    );
    const built = tableOf(compiled);

    expect(compiled.issues).to.deep.equal([]);
    expect(built.formPages).to.deep.equal({
      new: "/mockup?name=demo&page=order-new",
      edit: "/mockup?name=demo&page=order-edit&record=:id",
      view: "/mockup?name=demo&page=order&record=:id",
    });
    expect(built.formComponents).to.deep.equal({});
    expect(compiled.pages[0].links).to.deep.equal([
      "order-new",
      "order-edit",
      "order",
    ]);
  });

  it("reports a custom page form that names no spec page, a spec page without customPage and an edit page without a route, each at its pointer (fails when one is accepted)", () => {
    const compiled = compile(
      specWith(
        {
          rowActions: { add: true, edit: true, details: true },
          formContainer: {
            type: "page",
            pages: {
              new: { urlSlug: "new", customPage: true },
              edit: { urlSlug: "page:order-edit" },
              details: pageForm("order-view"),
            },
          },
        },
        [subPage("order-edit"), subPage("order-view")],
      ),
    );
    const at = "/pages/0/tree/0/options/formContainer/pages";

    expect(compiled.issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/new/urlSlug`,
      `${at}/edit/customPage`,
      `${at}/edit/urlSlug`,
      `${at}/details/urlSlug`,
    ]);
  });

  it("leaves a table that turns no form on as fromSource builds it, add and edit off", () => {
    const options = compile(specWith({})).pages[0].tree[0].options;

    expect(options).to.not.have.property("formContainer");
    expect(options).to.have.nested.property("rowActions.add", false);
    expect(options)
      .to.have.nested.property("formComponents")
      .that.deep.equals({});
  });
});

describe("[unit] mockup table drawer forms", () => {
  it("opens a drawer form from the direction formContainer names, as the real TableView does (fails when direction is dropped)", () => {
    const compiled = compile(
      specWith({
        rowActions: { edit: true },
        formContainer: { type: "drawer", direction: "right" },
      }),
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(compiled.pages[0].tree[0].options?.formContainer).to.deep.equal({
      type: "drawer",
      direction: "right",
    });
  });
});
