import { expect } from "chai";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import {
  CONNECTION,
  ROW_VALUES,
  MAPPED,
  MappingSchema,
  ITEMS_FROM_STATUS,
  CURRENCY_FROM_CURRENCY,
  TABS_FROM_STATUS,
  moduleCode,
  valueFree,
  mapOrders,
  writtenWithRowValues,
  connectDatabase,
  mappingOfOrders,
} from "./helpers/mapped-orders";

/**
 * The code a mapping writes reads its badge items, tabs and currency from columns. Each builder
 * tool that reads or edits it answers the references and keeps them; an implementation that
 * writes a value of a row on an edit fails here.
 */
describe("[unit] the builder tools over a mapped module's code keep its column references", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("reads the code it wrote back as references to columns, and keeps them on an edit", async () => {
    const orders = await mapOrders();
    const fields = await valueFree("builder_resource_structure", {
      ref: orders.ref,
    });
    expect(fields).to.include('"itemsFrom":{"column":"status"}');
    expect(fields).to.include('"currencyFrom":{"column":"currency"}');
    expect(fields).to.not.include("$hidden");
    const page = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(page).to.include('"tabsFrom":{"column":"status"}');
    expect(page).to.not.include("$hidden");
    const edits = [
      await valueFree("builder_configure_field", {
        path: `${orders.ref}#status`,
        patch: { label: "State" },
      }),
      await valueFree("builder_configure_block", {
        path: `${orders.page}#table`,
        patch: { caption: "Placed orders" },
      }),
      await valueFree("builder_configure_table_view", {
        pageRef: orders.page,
        kanban: { groupBy: "status" },
      }),
    ];
    for (const edit of edits) {
      expect(edit).to.include('"kind":"modify"');
    }
    const code = moduleCode();
    for (const value of ROW_VALUES) {
      expect(code, `the module's code holds ${value}`).to.not.include(value);
    }
    expect(code).to.include("State");
    expect(code).to.include("Placed orders");
    expect(code).to.include("groupByField");
    expect(code).to.match(ITEMS_FROM_STATUS);
    expect(code).to.match(CURRENCY_FROM_CURRENCY);
    expect(code).to.match(TABS_FROM_STATUS);
  });

  it("rewrites a module mapped before, which holds values of its rows, as references when it is mapped again", async () => {
    await writtenWithRowValues(await mapOrders());
    expect(moduleCode()).to.include("zq_paid");
    await valueFree("builder_map_resources", MAPPED);
    const code = moduleCode();
    for (const value of ROW_VALUES) {
      expect(code, `the module's code holds ${value}`).to.not.include(value);
    }
    expect(code).to.match(ITEMS_FROM_STATUS);
    expect(code).to.match(CURRENCY_FROM_CURRENCY);
    expect(code).to.match(TABS_FROM_STATUS);
  });

  it("writes a price plain, with no code of a row, when the relation's currency column is left out", async () => {
    await valueFree("builder_analyse_database", {
      connection: CONNECTION,
      module: MODULE,
    });
    await valueFree(
      "builder_map_resources",
      mappingOfOrders(
        { kind: "badge", values: 3 },
        (column) => column !== "currency",
      ),
    );
    const code = moduleCode();
    for (const value of ROW_VALUES) {
      expect(code, `the module's code holds ${value}`).to.not.include(value);
    }
    expect(code).to.include("new DefaultDataTypes.PriceType()");
    expect(code).to.not.include("currencyFrom");
  });

  it("answers no tabs once the column they read is no longer a badge", async () => {
    const orders = await mapOrders();
    await valueFree("builder_configure_field", {
      path: `${orders.ref}#status`,
      patch: { dataType: { $dataType: "string" } },
    });
    const mapping = MappingSchema.parse(
      JSON.parse(
        await valueFree("builder_mapping", {
          connection: CONNECTION,
          module: MODULE,
        }),
      ),
    );
    expect(mapping.data[0]?.resource.tabs).to.equal(undefined);
  });

  it("refuses a patch or a new block that both lists a TableView's tabs and reads them from a column", async () => {
    const orders = await mapOrders();
    const before = moduleCode();
    const refused = await run(mockupTool("builder_configure_block"), {
      path: `${orders.page}#table`,
      patch: {
        tabs: [{ id: "all", label: "All" }],
        tabsFrom: { column: "status" },
      },
    });
    expect(refused.isError, refused.text).to.equal(true);
    expect(refused.text).to.include("not both");
    const added = await run(mockupTool("builder_add_block"), {
      page: orders.page,
      name: "second",
      type: "TableView",
      controller: orders.ref,
      config: {
        tabs: [{ id: "all", label: "All" }],
        tabsFrom: { column: "status" },
      },
    });
    expect(added.isError, added.text).to.equal(true);
    expect(added.text).to.include("not both");
    expect(moduleCode()).to.equal(before);
  });
});
