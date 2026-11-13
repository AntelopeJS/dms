import { expect } from "chai";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  columnsOf,
  type DisplayDeclarations,
  optionsOf,
  OrderAPI,
  SearchableOrderAPI,
  StatusOrderAPI,
} from "./table-view-reduced-chrome.fixture";

function registerColumnAndLayoutCases(): void {
  it("serializes a column's display data type and width", () => {
    const number = columnsOf(TableView(OrderAPI, { realtime: false })).find(
      (column) => column.id === "number",
    );
    expect(number?.size).to.equal(220);
    expect(number?.display).to.deep.equal({
      type: "identity",
      options: { icon: "i-ph-x" },
    });
  });

  it("hides a column declared isVisible: false from the grid only", () => {
    const carrier = columnsOf(TableView(OrderAPI, { realtime: false })).find(
      (column) => column.id === "carrier",
    );
    expect(carrier).to.include({ isVisible: false });
  });

  it("passes the layout, search, quick filter, page size, footer and archived count through", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        layout: "compact",
        searchPlaceholder: "$orders.search",
        searchShortcut: "/",
        quickFilters: [{ field: "status" }],
        pageSize: 25,
        footer: { countLabel: "$orders.count", hint: "$orders.hint" },
        archivedCountLabel: "$orders.archived_count",
      }),
    );
    expect(options.layout).to.equal("compact");
    expect(options.archivedCountLabel).to.equal("$orders.archived_count");
    expect(options.searchable).to.equal(false);
    expect(options.searchPlaceholder).to.equal("$orders.search");
    expect(options.searchShortcut).to.equal("/");
    expect(options.quickFilters).to.deep.equal([{ field: "status" }]);
    expect(options.pageSize).to.equal(25);
    expect(options.footer).to.deep.equal({
      countLabel: "$orders.count",
      hint: "$orders.hint",
    });
  });

  it("tells the client whether the controller has fields to search in", () => {
    expect(
      optionsOf(TableView(SearchableOrderAPI, { realtime: false })).searchable,
    ).to.equal(true);
    expect(
      optionsOf(TableView(OrderAPI, { realtime: false })).searchable,
    ).to.equal(false);
  });

  it("offers built-in displays by id and module displays as <module>:<id>", () => {
    const component = CustomComponent("PlanCards");
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        displays: [{ id: "cards" }, { id: "saas:plan-cards", component }],
      }),
    );
    expect(options.displays?.map((display) => display.id)).to.deep.equal([
      "cards",
      "saas:plan-cards",
    ]);
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        displays: [{ id: "cards", component }],
      }),
    ).to.throw(/built-in display "cards" a component/);
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        displays: [{ id: "plan-cards", component }],
      }),
    ).to.throw(/"<module>:<id>"/);
  });
}

function registerDisplayAndKanbanCases(): void {
  it("offers the table alone by default, and exactly the listed displays otherwise", () => {
    const idsOf = (declared: DisplayDeclarations) =>
      optionsOf(
        TableView(StatusOrderAPI, { realtime: false, ...declared }),
      ).displays?.map((display) => display.id);
    expect(idsOf({})).to.deep.equal(["table"]);
    expect(
      idsOf({ displays: [{ id: "cards" }, { id: "table" }] }),
    ).to.deep.equal(["cards", "table"]);
    expect(idsOf({ displays: [{ id: "cards" }] })).to.deep.equal(["cards"]);
    expect(idsOf({ kanban: { groupByField: "status" } })).to.deep.equal([
      "table",
      "kanban",
    ]);
    expect(() =>
      TableView(OrderAPI, { realtime: false, displays: [] }),
    ).to.throw(/offers no display/);
  });

  it("hands the kanban options to a kanban display the list places", () => {
    const options = optionsOf(
      TableView(StatusOrderAPI, {
        realtime: false,
        kanban: { groupByField: "status" },
        displays: [{ id: "kanban" }, { id: "table" }],
      }),
    );
    expect(options.displays?.map((display) => display.id)).to.deep.equal([
      "kanban",
      "table",
    ]);
    expect(options.displays?.[0]?.options).to.deep.include({
      groupByField: "status",
    });
  });

  it("hands one card to the kanban and the cards displays", () => {
    const component = CustomComponent("OrderCard");
    const options = optionsOf(
      TableView(StatusOrderAPI, {
        realtime: false,
        kanban: { groupByField: "status", draggable: false },
        card: { fields: ["carrier"], component },
        displays: [{ id: "cards", options: { dense: true } }],
      }),
    );
    const card = { fields: ["carrier"], component: component.serializeSync() };
    const byId = Object.fromEntries(
      (options.displays ?? []).map((display) => [display.id, display.options]),
    );
    expect(byId.cards).to.deep.equal({ dense: true, card });
    expect(byId.kanban).to.deep.equal({
      groupByField: "status",
      draggable: false,
      card,
    });
  });

  it("hands the card's minimum width to the cards display", () => {
    const options = optionsOf(
      TableView(StatusOrderAPI, {
        realtime: false,
        card: { minWidth: "320px" },
        displays: [{ id: "cards" }],
      }),
    );
    expect(options.displays?.[0]?.options).to.deep.equal({
      card: { fields: undefined, component: undefined, minWidth: "320px" },
    });
  });

  it("hands the cards display the card's skeleton height", () => {
    const options = optionsOf(
      TableView(StatusOrderAPI, {
        realtime: false,
        card: { skeletonHeight: "260px" },
        displays: [{ id: "cards" }],
      }),
    );
    expect(options.displays?.[0]?.options).to.deep.equal({
      card: {
        fields: undefined,
        component: undefined,
        skeletonHeight: "260px",
      },
    });
  });
}

function registerQuickFilterAndPageSizeCases(): void {
  it("refuses a card field the controller lacks", () => {
    expect(() =>
      TableView(OrderAPI, { realtime: false, card: { fields: ["nope"] } }),
    ).to.throw(/card fields .* unknown column "nope"/);
  });

  it("refuses a page size over 50 or not a whole number of rows", () => {
    expect(() =>
      TableView(OrderAPI, { realtime: false, pageSize: 51 }),
    ).to.throw(/pageSize .* from 1 to 50 \(got 51\)/);
    expect(() =>
      TableView(OrderAPI, { realtime: false, pageSize: 0 }),
    ).to.throw(/pageSize/);
    expect(() =>
      TableView(OrderAPI, { realtime: false, pageSize: 12.5 }),
    ).to.throw(/pageSize/);
    expect(
      optionsOf(TableView(OrderAPI, { realtime: false, pageSize: 50 })),
    ).to.include({ pageSize: 50 });
  });

  it("refuses a quick filter the controller lacks", () => {
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        quickFilters: [{ field: "nope" }],
      }),
    ).to.throw(/quickFilters .* unknown column "nope"/);
  });

  it("refuses a quick filter on a column that cannot be filtered", () => {
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        quickFilters: [{ field: "carrier" }],
      }),
    ).to.throw(/"carrier" must be filterable/);
  });
}

describe("[unit] interfaces/dms-base — table view reduced chrome & expandable rows", () => {
  registerColumnAndLayoutCases();
  registerDisplayAndKanbanCases();
  registerQuickFilterAndPageSizeCases();
});
