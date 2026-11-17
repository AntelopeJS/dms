import path from "node:path";
import { expect } from "chai";
import type {
  FooterSummarySetting,
  ViewSetting,
} from "@antelopejs/interface-dms-builder";
import {
  ConfigureBlock,
  ConfigureTableView,
  CreatePage,
  ListPages,
} from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  configure,
  editOrdersController,
  freshMappedApp,
  installShopCatalog,
  ordersControllerPath,
  ordersControllerText,
  ordersFlag,
  ordersPage,
  pageSource,
  refusal,
  removeShopCatalog,
} from "./helpers/table-view-shop";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

function setsTheDisplays(): void {
  it("offers a kanban grouped by a single-choice column", async () => {
    await configure({ kanban: { groupBy: "status" } });
    expect(await pageSource()).to.include('kanban: { groupByField: "status" }');
  });

  it("refuses a kanban on a price, a text and an unknown column", async () => {
    for (const column of ["total", "reference", "nope"]) {
      const refused = refusal(
        await ConfigureTableView((await ordersPage()).ref, {
          kanban: { groupBy: column },
        }),
      );
      expect(refused).to.include("/kanban/groupBy");
    }
    expect(await pageSource()).to.not.include("kanban");
  });

  it("offers grouped rows by day on a sortable date and refuses what cannot group", async () => {
    await configure({
      grouped: { groupBy: "created_at", by: "day", count: false },
    });
    expect(await pageSource()).to.include(
      'grouped: { groupByField: "created_at", by: "day", count: false }',
    );
    const page = (await ordersPage()).ref;
    expect(
      refusal(
        await ConfigureTableView(page, {
          grouped: { groupBy: "status", by: "week" },
        }),
      ),
    ).to.include("needs a date column");
  });

  it("marks the grouped column sortable, and filterable when it counts, instead of refusing", async () => {
    const page = (await ordersPage()).ref;
    const result = await ConfigureTableView(page, {
      grouped: { groupBy: "total", count: true },
    });
    expectOk(result, "ConfigureTableView");
    const flags = JSON.stringify(result.ok ? result.warnings : "");
    expect(flags).to.include("field_flag_set");
    expect(flags).to.include("sortable");
    expect(flags).to.include("filterable");
    expect(await ordersFlag("total", "sortable")).to.equal(true);
    expect(await ordersFlag("total", "filterable")).to.equal(true);
  });

  it("offers cards with chosen fields, and sets the display shown first", async () => {
    await configure({
      cards: { fields: ["status", "total"] },
      defaultDisplay: "cards",
    });
    const source = await pageSource();
    expect(source).to.include('displays: [{ id: "table" }, { id: "cards" }]');
    expect(source).to.include('card: { fields: ["status", "total"] }');
    expect(source).to.include('defaultDisplay: "cards"');
  });

  it("keeps the grid listed when cards come with a kanban, and drops the list with the cards", async () => {
    await configure({
      cards: {},
      kanban: { groupBy: "status" },
      defaultDisplay: "kanban",
    });
    expect(await pageSource()).to.include('defaultDisplay: "kanban"');
    await configure({ cards: null, kanban: null, defaultDisplay: null });
    const source = await pageSource();
    for (const word of ["displays", "kanban", "defaultDisplay"]) {
      expect(source).to.not.include(word);
    }
  });

  it("refuses a default display the table does not offer, and removes a default that stops being offered", async () => {
    const page = (await ordersPage()).ref;
    expect(
      refusal(await ConfigureTableView(page, { defaultDisplay: "kanban" })),
    ).to.include("/defaultDisplay");
    await configure({
      kanban: { groupBy: "status" },
      defaultDisplay: "kanban",
    });
    const dropped = await configure({ kanban: null });
    expect(dropped.warnings?.[0]?.code).to.equal("setting_dropped");
    expect(await pageSource()).to.not.include("defaultDisplay");
  });

  it("refuses card fields the table does not list", async () => {
    expect(
      refusal(
        await ConfigureTableView((await ordersPage()).ref, {
          cards: { fields: ["nope"] },
        }),
      ),
    ).to.include("/cards/fields");
  });
}

function setsTheViews(): void {
  it("writes a named view with its filters, sort, columns and display", async () => {
    await configure({
      kanban: { groupBy: "status" },
      views: {
        layout: "strip",
        defaultView: "open",
        items: [
          {
            id: "open",
            label: "Open orders",
            count: true,
            filters: [
              {
                column: "status",
                value: ["pending", "paid"],
                mode: "include",
              },
            ],
            sort: [{ column: "created_at", desc: true }],
            columns: { hidden: ["channel"] },
            display: "kanban",
          },
          {
            id: "web",
            label: "Web",
            filters: [{ column: "channel", value: "web" }],
          },
        ],
      },
    });
    const source = await pageSource();
    expect(source).to.include(
      '{ accessorKey: "status", value: "pending,paid", mode: "include" }',
    );
    expect(source).to.include('sort: [{ field: "created_at", desc: true }]');
    expect(source).to.include(
      '{ accessorKey: "channel", value: "web", mode: "is" }',
    );
    expect(source).to.include('layout: "strip"');
    expect(source).to.include('defaultView: "open"');
  });

  it("marks the columns a view filters or sorts on, and a footer figure compares, instead of refusing", async () => {
    const page = (await ordersPage()).ref;
    const result = await ConfigureTableView(page, {
      views: {
        items: [
          {
            id: "v",
            label: "V",
            filters: [{ column: "reference", value: "x" }],
            sort: [{ column: "total" }],
          },
        ],
      },
      footer: {
        summary: [
          {
            label: "Web",
            op: "count",
            where: { column: "total", op: "equals", value: 5 },
          },
        ],
      },
    });
    expectOk(result, "ConfigureTableView");
    expect(await ordersFlag("reference", "filterable")).to.equal(true);
    expect(await ordersFlag("total", "sortable")).to.equal(true);
    expect(await ordersFlag("reference", "filterable")).to.equal(true);
    expect(JSON.stringify(result.ok ? result.warnings : "")).to.include(
      "field_flag_set",
    );
  });

  it("refuses a view sorting on an unknown column and a display not offered", async () => {
    const page = (await ordersPage()).ref;
    const view = (extra: Partial<ViewSetting>) => ({
      views: { items: [{ id: "v", label: "V", ...extra }] },
    });
    expect(
      refusal(
        await ConfigureTableView(page, view({ sort: [{ column: "nope" }] })),
      ),
    ).to.include("no column");
    expect(
      refusal(await ConfigureTableView(page, view({ display: "kanban" }))),
    ).to.include("does not offer");
    expect(
      refusal(
        await ConfigureTableView(
          page,
          view({ filters: [{ column: "status" }] }),
        ),
      ),
    ).to.include("needs a value");
  });

  it("refuses a view id that is not a slug, a taken id and a default view that does not exist", async () => {
    const page = (await ordersPage()).ref;
    const items = [
      { id: "Late Orders", label: "A" },
      { id: "b", label: "B" },
      { id: "b", label: "C" },
    ];
    const refused = refusal(
      await ConfigureTableView(page, {
        views: { items, defaultView: "zzz" },
      }),
    );
    expect(refused).to.include("not a view id");
    expect(refused).to.include("is taken");
    expect(refused).to.include("defaultView");
  });

  it("removes the views with null", async () => {
    await configure({ views: { items: [{ id: "all", label: "All" }] } });
    await configure({ views: null });
    expect(await pageSource()).to.not.include("views");
  });
}

function setsTheFooterFigures(): void {
  it("writes sum and count figures, one counting the rows where a column compares", async () => {
    await configure({
      footer: {
        summary: [
          { label: "Revenue", op: "sum", field: "total" },
          { label: "Orders", op: "count" },
          {
            label: "Cancelled",
            op: "count",
            where: { column: "status", op: "equals", value: "cancelled" },
          },
        ],
      },
    });
    const source = await pageSource();
    expect(source).to.include(
      '{ label: "Revenue", op: "sum", field: "total" }',
    );
    expect(source).to.include('{ label: "Orders", op: "count" }');
    expect(source).to.include(
      'where: { field: "status", equals: "cancelled" }',
    );
  });

  it("refuses a sum over a text column, a sum with no column and a list operator with one value", async () => {
    const page = (await ordersPage()).ref;
    const footer = (entry: Partial<FooterSummarySetting>) => ({
      footer: { summary: [{ label: "X", op: "sum" as const, ...entry }] },
    });
    expect(
      refusal(await ConfigureTableView(page, footer({ field: "reference" }))),
    ).to.include("number or price");
    expect(refusal(await ConfigureTableView(page, footer({})))).to.include(
      "needs the column",
    );
    expect(
      refusal(
        await ConfigureTableView(
          page,
          footer({
            field: "total",
            where: { column: "status", op: "in", value: "paid" },
          }),
        ),
      ),
    ).to.include("takes a list");
  });

  it("keeps the footer's other texts when it replaces the figures, and removes it with null", async () => {
    const page = await ordersPage();
    expectOk(
      await ConfigureBlock(`${page.ref}#table`, {
        footer: { countLabel: "orders" },
      }),
      "ConfigureBlock",
    );
    await configure({
      footer: { summary: [{ label: "Orders", op: "count" }] },
    });
    expect(await pageSource()).to.include('countLabel: "orders"');
    await configure({ footer: { summary: [] } });
    const source = await pageSource();
    expect(source).to.include('countLabel: "orders"');
    expect(source).to.not.include("summary");
    await configure({ footer: null });
    expect(await pageSource()).to.not.include("footer");
  });

  it("mounts the summary route on a controller whose route map names its routes without it", async () => {
    expect(ordersControllerText()).to.include(
      "summary: TableViewRoutes.Summary",
    );
    editOrdersController((text) =>
      text.replace(/summary: TableViewRoutes\.Summary,\s*/, ""),
    );
    const result = await configure({
      footer: { summary: [{ label: "Orders", op: "count" }] },
    });
    expect(ordersControllerText()).to.include(
      "summary: TableViewRoutes.Summary",
    );
    expect(
      result.changes.map((change) => path.resolve(change.path)),
    ).to.include(path.resolve(ordersControllerPath()));
  });

  it("refuses a footer figure on a resource that serves no list", async () => {
    editOrdersController((text) =>
      text
        .replace(/list: TableViewRoutes\.List,\s*/, "")
        .replace(/summary: TableViewRoutes\.Summary,\s*/, ""),
    );
    const refused = refusal(
      await ConfigureTableView((await ordersPage()).ref, {
        footer: { summary: [{ label: "Orders", op: "count" }] },
      }),
    );
    expect(refused).to.include("serves no list route");
    expect(await pageSource()).to.not.include("footer");
  });
}

describe("setting displays, views and footer figures on a table page", function () {
  this.timeout(OP_TIMEOUT);

  before(installShopCatalog);

  beforeEach(freshMappedApp);

  after(removeShopCatalog);

  describe("displays", () => {
    setsTheDisplays();
  });

  describe("views", () => {
    setsTheViews();
  });

  describe("footer", () => {
    setsTheFooterFigures();
  });

  describe("a page without a table", () => {
    it("refuses a page that holds no TableView", async () => {
      expectOk(
        await CreatePage({
          name: "empty",
          displayName: "Empty",
          category: "pages.shop",
          module: MODULE,
        }),
        "CreatePage",
      );
      const empty = (await ListPages()).find((entry) => entry.id === "empty")!;
      expect(
        refusal(await ConfigureTableView(empty.ref, { kanban: null })),
      ).to.include("holds no TableView");
    });
  });
});
