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

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function onePage(tree: Json[], fixtures: Json = {}): Json {
  return { version: 1, pages: [{ id: "home", title: "Home", fixtures, tree }] };
}

const compiledColumnsSchema = z.object({
  columns: z.array(
    z.object({
      id: z.string(),
      type: z.object({
        id: z.string(),
        inputComponent: z.object({ options: z.record(z.unknown()) }),
      }),
      display: z.unknown().optional(),
    }),
  ),
});

/** The columns the first table of a compiled one-page spec serializes, by id. */
function compiledColumns(compiled: CompiledSpec) {
  const options = compiled.pages[0]?.tree[0]?.options;
  return new Map(
    compiledColumnsSchema
      .parse(options)
      .columns.map((column) => [column.id, column]),
  );
}

const ORDER_ROWS = [
  { _id: "o1", status: "paid", total: 120, customer: "Acme", email: "a@x.io" },
  { _id: "o2", status: "late", total: 80, customer: "Corvid", email: "c@x.io" },
];

function tableOf(options: JsonObject): Json {
  return onePage(
    [{ type: "TableView", options: { caption: "Orders", ...options } }],
    { orders: ORDER_ROWS },
  );
}

const STATUS_BADGE = {
  kind: "badge",
  items: [
    { value: "paid", label: "Paid", tone: "success" },
    { value: "late", label: "Late", tone: "error" },
  ],
};

function buildsColumnDisplays(): void {
  it("draws a badge column as a select of toned items, a price column in its currency, and a cell display as the TableView serializes it (fails when a column's display is dropped)", () => {
    const compiled = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: {
          status: { type: "string", display: STATUS_BADGE },
          stage: { type: "select", display: STATUS_BADGE },
          total: {
            type: "number",
            display: { kind: "price", currency: "EUR" },
          },
          customer: {
            type: "string",
            display: { type: "identity", options: { subtitleField: "email" } },
          },
        },
      }),
    );
    const columns = compiledColumns(compiled);
    const items = [
      { label: "Paid", value: "paid", textColor: "success" },
      { label: "Late", value: "late", textColor: "error" },
    ];

    expect(compiled.issues).to.deep.equal([]);
    expect(columns.get("status")?.type.id).to.equal("select");
    expect(
      columns.get("status")?.type.inputComponent.options.items,
    ).to.deep.equal(items);
    expect(
      columns.get("stage")?.type.inputComponent.options.items,
    ).to.deep.equal(items);
    expect(columns.get("total")?.type.id).to.equal("price");
    expect(columns.get("total")?.type.inputComponent.options.currency).to.equal(
      "EUR",
    );
    expect(columns.get("customer")?.display).to.deep.equal({
      type: "identity",
      options: { subtitleField: "email" },
    });
  });

  it("refuses a display the column's type cannot carry, a cell display the DMS does not draw and a tone it does not have, each at its pointer", () => {
    const { issues } = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: {
          status: { type: "date", display: STATUS_BADGE },
          customer: { type: "string", display: { type: "sparkles" } },
          total: {
            type: "string",
            display: {
              kind: "badge",
              items: [{ value: "x", label: "X", tone: "red" }],
            },
          },
        },
      }),
    );
    const at = "/pages/0/tree/0/options/columns";

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/status/display`,
      `${at}/customer/display/type`,
      `${at}/total/display/items/0/tone`,
    ]);
    expect(issues[0]?.message).to.equal(
      "a badge display needs a string column, not date",
    );
    expect(issues[1]?.message).to.match(
      /^"sparkles" is not a cell display of the DMS; it draws .*identity/,
    );
  });

  it("refuses a cell display option its class does not take, at the option's pointer, as the builder does", () => {
    const { issues } = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: {
          customer: {
            type: "string",
            display: { type: "two_line", options: { subField: 3 } },
          },
          id: {
            type: "string",
            display: { type: "mono", options: { colour: "red" } },
          },
        },
      }),
    );
    const at = "/pages/0/tree/0/options/columns";

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/customer/display/options/subField`,
      `${at}/id/display/options`,
    ]);
    expect(issues[1]?.message).to.match(/colour/);
  });
}

const compiledTableSchema = z.object({
  displays: z.array(z.object({ id: z.string(), options: z.unknown() })),
  defaultDisplay: z.string().optional(),
  tabs: z.unknown().optional(),
  views: z.unknown().optional(),
});

function compiledTable(compiled: CompiledSpec) {
  return compiledTableSchema.parse(compiled.pages[0]?.tree[0]?.options);
}

const BOARD_COLUMNS = {
  customer: { type: "string" },
  status: {
    type: "string",
    filterable: true,
    sortable: true,
    display: STATUS_BADGE,
  },
  total: { type: "number", sortable: true },
};

function buildsBoardsAndGroups(): void {
  it("offers a kanban board on a badge column and a grouped display, each a display entry, the board's cards never dragged (fails when kanban or grouped is refused or dropped)", () => {
    const compiled = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        kanban: { groupByField: "status" },
        grouped: { groupByField: "status", count: true },
        defaultDisplay: "kanban",
      }),
    );
    const table = compiledTable(compiled);

    expect(compiled.issues).to.deep.equal([]);
    expect(table.displays).to.deep.equal([
      { id: "table" },
      {
        id: "kanban",
        options: {
          groupByField: "status",
          draggable: false,
          columnMaxHeight: "60vh",
        },
      },
      { id: "grouped", options: { groupByField: "status", count: true } },
    ]);
    expect(table.defaultDisplay).to.equal("kanban");
  });

  it("refuses a board on a column that is no single choice, a grouped display on a column that does not sort, and a default display the table does not offer", () => {
    const at = "/pages/0/tree/0/options";
    const board = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        kanban: { groupByField: "customer" },
        grouped: { groupByField: "customer" },
      }),
    );
    const notOffered = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        defaultDisplay: "kanban",
      }),
    );

    expect(board.issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/kanban/groupByField`,
      `${at}/grouped/groupByField`,
    ]);
    expect(notOffered.issues).to.deep.equal([
      {
        path: at,
        message:
          'TableView on TableView.fromSource(/api/mockup/demo/pages/home/fixtures/orders/rows) defaults to display "kanban" which is not declared in displays',
      },
    ]);
  });
}

function buildsTabsAndViews(): void {
  it("draws tabsFrom as the builder writes tabs from a badge column: All, then one tab per value in its tone (fails when tabsFrom is refused or dropped)", () => {
    const compiled = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        tabsFrom: { column: "status" },
      }),
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(compiledTable(compiled).tabs).to.deep.equal([
      { id: "all", label: "All" },
      {
        id: "status-paid",
        label: "Paid",
        filter: { accessorKey: "status", value: "paid", mode: "is" },
        textColor: "success",
      },
      {
        id: "status-late",
        label: "Late",
        filter: { accessorKey: "status", value: "late", mode: "is" },
        textColor: "error",
      },
    ]);
  });

  it("refuses tabsFrom on a column without a badge or a filter, and beside tabs", () => {
    const at = "/pages/0/tree/0/options";
    const plain = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        tabsFrom: { column: "customer" },
      }),
    );
    const both = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        tabsFrom: { column: "status" },
        tabs: [{ id: "all", label: "All" }],
      }),
    );

    expect(plain.issues).to.deep.equal([
      {
        path: `${at}/tabsFrom/column`,
        message:
          'tabs by "customer" need a column the table filters, with a badge display',
      },
    ]);
    expect(both.issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/tabsFrom`,
    ]);
  });

  it("serves saved views as the TableView serializes them (fails when views are refused or dropped)", () => {
    const views: Json = {
      items: [
        {
          id: "late",
          label: "Late",
          tone: "error",
          count: true,
          filters: [{ accessorKey: "status", value: "late", mode: "is" }],
          sort: [{ field: "total", desc: true }],
        },
        { id: "board", label: "Board", display: "kanban" },
      ],
      layout: "strip",
      defaultView: "late",
    };
    const compiled = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        kanban: { groupByField: "status" },
        views,
      }),
    );

    expect(compiled.issues).to.deep.equal([]);
    expect(compiledTable(compiled).views).to.deep.equal(views);
  });

  it("refuses a view on a column it cannot filter or sort, a display not offered, a taken id and an unknown default view, each at its pointer", () => {
    const at = "/pages/0/tree/0/options/views";
    const { issues } = compile(
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        views: {
          items: [
            {
              id: "big",
              label: "Big",
              filters: [
                { accessorKey: "total", value: "100", mode: "greater_than" },
              ],
              sort: [{ field: "customer" }],
            },
            { id: "big", label: "Board", display: "kanban" },
          ],
          defaultView: "missing",
        },
      }),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      `${at}/items/0/filters/0/accessorKey`,
      `${at}/items/0/sort/0/field`,
      `${at}/items/1/id`,
      `${at}/items/1/display`,
      `${at}/defaultView`,
    ]);
  });
}

function refusesUnknownTabKeys(): void {
  it("refuses a key no tab has at that key, naming textColor and iconColor for a color, and keeps a tab written right (fails when an unknown tab key is dropped)", () => {
    const at = "/pages/0/tree/0/options/tabs";
    const tabs = (late: JsonObject): Json =>
      tableOf({
        fetchUrl: "fixture:orders",
        columns: BOARD_COLUMNS,
        tabs: [
          { id: "all", label: "All" },
          {
            id: "late",
            label: "Late",
            filter: { accessorKey: "status", value: "late", mode: "is" },
            ...late,
          },
        ],
      });
    const wrong = compile(tabs({ color: "error", badge: true }));
    const right = compile(tabs({ textColor: "error", iconColor: "error" }));

    expect(wrong.issues).to.deep.equal([
      {
        path: `${at}/1/color`,
        message:
          'a tab has no "color": textColor colours its label and iconColor its icon, each a tone such as success',
      },
      {
        path: `${at}/1/badge`,
        message:
          'a tab has no "badge": its keys are id, label, filter, icon, textColor, iconColor, to, permission, permissionId, countFrom, navBadge',
      },
    ]);
    expect(right.issues).to.deep.equal([]);
  });
}

describe("[unit] mockup tables: displays", () => {
  buildsColumnDisplays();
  buildsBoardsAndGroups();
  buildsTabsAndViews();
  refusesUnknownTabKeys();
});
