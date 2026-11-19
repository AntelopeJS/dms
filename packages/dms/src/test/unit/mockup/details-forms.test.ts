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

const RECORD = "/api/mockup/demo/pages/orders/fixtures/orders/record";

function compile(pages: Json[]): CompiledSpec {
  const read = parseSpec(JSON.stringify({ version: 1, pages }));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function ordersPage(options: JsonObject): JsonObject {
  return {
    id: "orders",
    title: "Orders",
    fixtures: { orders: ORDERS },
    tree: [
      {
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
      },
    ],
  };
}

function formPage(id: string, mode?: string): JsonObject {
  return {
    id,
    title: id,
    menu: false,
    parent: "orders",
    route: ":id",
    tree: [
      {
        type: "ResourceForm",
        options: {
          ...(mode !== undefined && { mode }),
          fetchUrl: "fixture:orders",
          fields: [
            { id: "customer", label: "Customer", type: "string" },
            { id: "total", label: "Total", type: "number" },
          ],
        },
      },
    ],
  };
}

const pageForm = (id: string): JsonObject => ({
  urlSlug: `page:${id}`,
  customPage: true,
});

const fieldSchema = z
  .object({ id: z.string(), disabled: z.boolean().optional() })
  .passthrough();
const formOptionsSchema = z
  .object({
    fields: z.array(fieldSchema),
    fetchUrl: z.string().optional(),
    submitUrl: z.string().optional(),
  })
  .passthrough();
const tableSchema = z.object({
  formContainer: z.object({ type: z.string() }),
  formComponents: z.object({
    view: z.object({ options: formOptionsSchema }).optional(),
  }),
});

const disabledOf = (fields: z.infer<typeof fieldSchema>[]) =>
  fields.map((field) => field.disabled === true);

describe("[unit] mockup details forms", () => {
  it("draws a table's details in the default modal, a drawer and with no formContainer as a read-only form over its columns that reads the row and saves nowhere, as the real TableView does (fails while details are refused in a modal)", () => {
    const containers: Array<JsonObject | undefined> = [
      undefined,
      { type: "modal" },
      { type: "drawer" },
    ];
    const built = containers.map((formContainer) => {
      const compiled = compile([
        ordersPage({
          rowActions: { details: true },
          ...(formContainer && { formContainer }),
        }),
      ]);
      const table = tableSchema.parse(compiled.pages[0].tree[0].options);
      return { issues: compiled.issues, table };
    });

    for (const { issues, table } of built) {
      const view = table.formComponents.view?.options;
      expect(issues).to.deep.equal([]);
      expect(view?.fetchUrl).to.equal(`${RECORD}?id={{params.id}}`);
      expect(view?.submitUrl).to.equal(undefined);
      expect(view?.fields.map((field) => field.id)).to.deep.equal([
        "customer",
        "total",
      ]);
      expect(disabledOf(view?.fields ?? [])).to.deep.equal([true, true]);
    }
    expect(built.map(({ table }) => table.formContainer.type)).to.deep.equal([
      "modal",
      "modal",
      "drawer",
    ]);
  });

  it("draws a ResourceForm in view mode read-only, every field disabled, and one in edit mode with its fields open (fails when view mode draws an editable form)", () => {
    const compiled = compile([
      ordersPage({}),
      formPage("order", "view"),
      formPage("order-edit", "edit"),
    ]);
    const fieldsOf = (index: number) =>
      formOptionsSchema.parse(compiled.pages[index].tree[0].options).fields;

    expect(compiled.issues).to.deep.equal([]);
    expect(disabledOf(fieldsOf(1))).to.deep.equal([true, true]);
    expect(disabledOf(fieldsOf(2))).to.deep.equal([false, false]);
  });

  it("reports a table's details page holding a ResourceForm not in view mode, and its edit page holding one in view mode, at the form's mode (fails when either is accepted)", () => {
    const compiled = compile([
      ordersPage({
        rowActions: { edit: true, details: true },
        formContainer: {
          type: "page",
          pages: {
            edit: pageForm("order-edit"),
            details: pageForm("order"),
          },
        },
      }),
      formPage("order"),
      formPage("order-edit", "view"),
    ]);

    expect(compiled.issues).to.deep.equal([
      {
        path: "/pages/1/tree/0/options/mode",
        message:
          'this page is the details page of the table at /pages/0/tree/0: set mode to "view", so the form is drawn read-only, as the table\'s own details are',
      },
      {
        path: "/pages/2/tree/0/options/mode",
        message:
          'this page is the edit page of the table at /pages/0/tree/0: set mode to "edit", so its fields can be changed',
      },
    ]);
  });

  it("accepts a details page in view mode and an edit page in edit mode (fails when the rule reports a right mode)", () => {
    const compiled = compile([
      ordersPage({
        rowActions: { edit: true, details: true },
        formContainer: {
          type: "page",
          pages: {
            edit: pageForm("order-edit"),
            details: pageForm("order"),
          },
        },
      }),
      formPage("order", "view"),
      formPage("order-edit", "edit"),
    ]);

    expect(compiled.issues).to.deep.equal([]);
  });
});
