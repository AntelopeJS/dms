import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  type TableViewExpandableOptions,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import { resolveCustomRowActions } from "@antelopejs/interface-dms/base/table-view/request-filter";
import { resolveTableViewTabs } from "@antelopejs/interface-dms/base/table-view/tabs";

const TABLE = "reduced-chrome-orders";
const LOCATION = "/api/reduced-chrome-orders";
const LINES_LOCATION = "/api/reduced-chrome-lines";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Order extends Table {
  @Field("string") declare number: string;
  @Field("string") declare status: string;
  @Field("string") declare carrier: string;
}

class OrderModel extends BasicDataModel(Order, TABLE) {}

@RegisterDataController()
class OrderAPI extends DataController(
  Order,
  { list: TableViewRoutes.List, countBatch: TableViewRoutes.CountBatch },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Listable()
  @Column({
    name: "Order",
    type: new DefaultDataTypes.StringType(),
    size: 220,
    display: { type: "identity", label: "Ref", options: { icon: "i-ph-x" } },
  })
  @Access(AccessMode.ReadOnly)
  declare number: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: [] }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({
    name: "Carrier",
    type: new DefaultDataTypes.StringType(),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare carrier: string;
}

@RegisterDataController()
class LineAPI extends DataController(
  Order,
  { list: TableViewRoutes.List },
  Controller(LINES_LOCATION),
) {}

const SEARCHABLE_LOCATION = "/api/reduced-chrome-searchable";

@RegisterDataController()
class SearchableOrderAPI extends DataController(
  Order,
  { list: TableViewRoutes.List },
  Controller(SEARCHABLE_LOCATION),
) {
  @Listable()
  @Searchable()
  @Column({ name: "Order", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare number: string;
}

const optionsOf = (table: ReturnType<typeof TableView>) =>
  table.serializeSync().options as TableViewOptionsSerialized;

const columnsOf = (table: ReturnType<typeof TableView>) =>
  (
    optionsOf(table) as unknown as {
      columns: Array<{ id: string; size?: number; display?: unknown }>;
    }
  ).columns;

describe("[unit] interfaces/dms-base — table view reduced chrome & expandable rows", () => {
  it("serializes a column's display data type and width", () => {
    const number = columnsOf(TableView(OrderAPI, { realtime: false })).find(
      (column) => column.id === "number",
    );
    expect(number?.size).to.equal(220);
    expect(number?.display).to.deep.equal({
      type: "identity",
      label: "Ref",
      options: { icon: "i-ph-x" },
    });
  });

  it("hides a column declared isVisible: false from the grid only", () => {
    const carrier = columnsOf(TableView(OrderAPI, { realtime: false })).find(
      (column) => column.id === "carrier",
    ) as { isVisible?: boolean; listable?: boolean } | undefined;
    expect(carrier).to.include({ isVisible: false });
  });

  it("passes the layout, search, quick filter, page size and footer through", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        layout: "compact",
        searchPlaceholder: "$orders.search",
        quickFilters: [{ field: "status" }],
        pageSize: 25,
        footer: { countLabel: "$orders.count", hint: "$orders.hint" },
      }),
    );
    expect(options.layout).to.equal("compact");
    expect(options.searchable).to.equal(false);
    expect(options.searchPlaceholder).to.equal("$orders.search");
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
    expect(optionsOf(TableView(OrderAPI, { realtime: false })).searchable).to.equal(
      false,
    );
  });

  it("refuses a page size over 50 or not a whole number of rows", () => {
    expect(() =>
      TableView(OrderAPI, { realtime: false, pageSize: 51 }),
    ).to.throw(/pageSize .* from 1 to 50 \(got 51\)/);
    expect(() => TableView(OrderAPI, { realtime: false, pageSize: 0 })).to.throw(
      /pageSize/,
    );
    expect(() =>
      TableView(OrderAPI, { realtime: false, pageSize: 12.5 }),
    ).to.throw(/pageSize/);
    expect(optionsOf(TableView(OrderAPI, { realtime: false, pageSize: 50 })))
      .to.include({ pageSize: 50 });
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

  it("normalizes the expandable fields and refuses an unknown one", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: {
          fields: ["carrier", { key: "status", label: "State" }],
          defaultExpanded: "first",
          single: true,
        },
      }),
    );
    expect(options.expandable).to.deep.equal({
      fields: [{ key: "carrier" }, { key: "status", label: "State" }],
      fieldsLabel: undefined,
      defaultExpanded: "first",
      single: true,
    });
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        expandable: { fields: ["missing"] },
      }),
    ).to.throw(/expandable fields .* unknown column "missing"/);
  });

  it("hands the band to a component alone, refusing both or neither", () => {
    const component = CustomComponent("OrderLines");
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        expandable: { component, single: true },
      }),
    );
    expect(options.expandable).to.deep.equal({
      defaultExpanded: undefined,
      single: true,
      component: component.serializeSync(),
    });
    // What the types refuse, a schema-built option can still carry.
    const both = {
      component,
      fields: ["carrier"],
    } as unknown as TableViewExpandableOptions;
    expect(() =>
      TableView(OrderAPI, { realtime: false, expandable: both }),
    ).to.throw(/both fields and a component/);
    const neither = { single: true } as unknown as TableViewExpandableOptions;
    expect(() =>
      TableView(OrderAPI, { realtime: false, expandable: neither }),
    ).to.throw(/neither fields nor a component/);
  });

  it("serializes link tabs: a path, the count location, no filters", () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        tabs: [
          { id: "all", label: "Orders" },
          {
            id: "lines",
            label: "Lines",
            to: "/orders/lines",
            permission: "orders.lines",
            countFrom: LineAPI,
            badge: true,
          },
          {
            id: "open",
            label: "Open",
            filter: { accessorKey: "status", value: "open", mode: "is" },
          },
        ],
      }),
    );
    expect(options.tabs).to.deep.equal([
      { id: "all", label: "Orders" },
      {
        id: "lines",
        label: "Lines",
        badge: true,
        to: "/orders/lines",
        countFrom: LINES_LOCATION,
      },
      {
        id: "open",
        label: "Open",
        filter: { accessorKey: "status", value: "open", mode: "is" },
      },
    ]);
  });

  it("refuses a tab that both filters and links", () => {
    expect(() =>
      TableView(OrderAPI, {
        realtime: false,
        tabs: [
          {
            id: "lines",
            label: "Lines",
            to: "/orders/lines",
            filter: { accessorKey: "status", value: "x", mode: "is" },
          },
        ],
      }),
    ).to.throw(/tab "lines" .* both a filter and a link/);
  });

  it("keeps a link tab without a permission and every tab of a table without links", async () => {
    const declared = [{ id: "a", label: "A", to: "/a" }];
    const serialized = [{ id: "a", label: "A", to: "/a" }];
    expect(
      await resolveTableViewTabs(new Set(), declared, serialized),
    ).to.deep.equal(serialized);
    expect(
      await resolveTableViewTabs(new Set(), undefined, undefined),
    ).to.equal(undefined);
  });

  it("serializes the look of custom row actions and keeps those without a permission", async () => {
    const options = optionsOf(
      TableView(OrderAPI, {
        realtime: false,
        rowActions: {
          custom: [
            {
              label: "Resend",
              icon: "i-ph-paper-plane-tilt",
              isVisible: true,
              showLabel: true,
              color: "error",
              target: { type: "page", url: "/x/{_id}" },
            },
          ],
        },
      }),
    );
    const [action] = options.rowActions?.custom ?? [];
    expect(action).to.include({ color: "error", showLabel: true });
    expect(
      await resolveCustomRowActions(
        new Set(),
        [{}],
        options.rowActions?.custom,
        "orders",
      ),
    ).to.have.length(1);
  });
});
