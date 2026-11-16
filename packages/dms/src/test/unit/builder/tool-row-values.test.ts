import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import { projectFile } from "./helpers/project-files";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import {
  CONNECTION,
  ORDERS,
  ROW_VALUES,
  PageSchema,
  ITEMS_FROM_STATUS,
  CURRENCY_FROM_CURRENCY,
  TABS_FROM_STATUS,
  moduleCode,
  valueFree,
  mapOrders,
  writtenWithRowValues,
  connectDatabase,
  fixtureRoot,
} from "./row-values-erp";

/**
 * The AI gets the shape of a connected database, never its values. Each tool that reads the
 * database answers with every value above left out, and the module it maps holds none in any of
 * its files; an implementation that passes a profile's range, category values or months through,
 * or a proposal's badge items or currency, or a written file's diff, or that writes a badge's
 * items, a currency or tabs read from rows into the code, fails here.
 */
describe("[unit] the tools that read a connected database answer no value of a row", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("lists, describes and profiles the relation by counts only", async () => {
    await valueFree("database_relations", { connection: CONNECTION });
    await valueFree("database_describe", {
      connection: CONNECTION,
      relations: [ORDERS],
    });
    const profiled = await valueFree("database_profile", {
      connection: CONNECTION,
      relation: ORDERS,
      references: [
        {
          from: { relation: ORDERS, column: "currency" },
          to: { relation: ORDERS, column: "id" },
        },
      ],
    });
    expect(profiled).to.include('"rows":[5,3,2]');
    expect(profiled).to.include('"months":{"status":"ok","value":2}');
  });

  it("proposes a badge and a price without their values", async () => {
    const analysed = await valueFree("builder_analyse_database", {
      connection: CONNECTION,
      module: MODULE,
    });
    expect(analysed).to.include('"status":"done"');
    expect(analysed).to.include('{"kind":"badge","values":3}');
    expect(analysed).to.include('{"kind":"price"}');
  });

  it("writes the badge, the currency and the tabs as references to their columns, and no value of a row in the module", async () => {
    await mapOrders();
    const code = moduleCode();
    for (const value of ROW_VALUES) {
      expect(code, `the module's code holds ${value}`).to.not.include(value);
    }
    expect(code).to.match(ITEMS_FROM_STATUS);
    expect(code).to.match(CURRENCY_FROM_CURRENCY);
    expect(code).to.match(TABS_FROM_STATUS);
    const mapping = await valueFree("builder_mapping", {
      connection: CONNECTION,
      module: MODULE,
    });
    expect(mapping).to.include('{"kind":"badge","values":3}');
  });
});

/**
 * A module mapped before references holds badge items, tabs and a currency read from rows. Each
 * builder tool that reads or edits that code answers with every value above left out; an
 * implementation that shows a structure or a diff of the mapped code, or of a mapped page moved
 * out of its module, fails here, and so does one that lets an edit drop what it hides.
 */
describe("[unit] the builder tools over a module mapped before references answer no value of a row", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("reads the code back with the values it holds from rows hidden, and keeps them on an edit", async () => {
    const orders = await mapOrders();
    await writtenWithRowValues(orders);
    const fields = await valueFree("builder_resource_structure", {
      ref: orders.ref,
    });
    expect(fields).to.include('"items":{"$hidden":3}');
    expect(fields).to.include('"currency":{"$hidden":1}');
    const page = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(page).to.include('"tabs":{"$hidden":4}');
    const pageFile = PageSchema.parse(JSON.parse(page)).data.page.filepath;
    const relabelled = await valueFree("builder_configure_field", {
      path: `${orders.ref}#status`,
      patch: { label: "State" },
    });
    const recaptioned = await valueFree("builder_configure_block", {
      path: `${orders.page}#table`,
      patch: { caption: "Placed orders" },
    });
    const restyled = await valueFree("builder_configure_table_view", {
      pageRef: orders.page,
      kanban: { groupBy: "status" },
    });
    for (const edit of [relabelled, recaptioned, restyled]) {
      expect(edit).to.include('"kind":"modify"');
      expect(edit).to.not.include('"diff"');
    }
    const echoed = await run(mockupTool("builder_configure_block"), {
      path: `${orders.page}#table`,
      patch: { tabs: { $hidden: 4 } },
    });
    expect(echoed.isError).to.equal(true);
    expect(echoed.text).to.include("$hidden");
    const replaced = await run(mockupTool("builder_configure_block"), {
      path: `${orders.page}#table`,
      patch: { caption: "Orders" },
      replace: true,
    });
    expect(replaced.isError).to.equal(true);
    expect(replaced.text).to.include("would drop tabs");
    const slashed = await run(mockupTool("builder_configure_block"), {
      path: `${orders.page}#table/`,
      patch: { caption: "Orders" },
      replace: true,
    });
    expect(slashed.isError).to.equal(true);
    const code = [...orders.files, pageFile]
      .map((file) =>
        projectFile(fixtureRoot(), path.relative(fixtureRoot(), file)),
      )
      .join("\n");
    expect(code).to.include("State");
    expect(code).to.include("Placed orders");
    expect(code).to.include("groupByField");
    expect(code).to.include("status-zq-paid");
    expect(code).to.include("zq_paid");
    expect(code).to.include("JPY");
  });

  it("keeps the values hidden on a mapped page moved into a project category", async () => {
    const orders = await mapOrders();
    await writtenWithRowValues(orders);
    await valueFree("builder_create_category", {
      name: "ops",
      displayName: "Ops",
    });
    const moved = await valueFree("builder_configure_page", {
      pageRef: orders.page,
      patch: { category: "pages.ops" },
    });
    expect(moved).to.include('"kind":"create"');
    const page = await valueFree("builder_page_structure", {
      pageRef: "/ops/erp-orders",
    });
    expect(page).to.include('"tabs":{"$hidden":4}');
    const recaptioned = await valueFree("builder_configure_block", {
      path: "/ops/erp-orders#table",
      patch: { caption: "Placed orders" },
    });
    expect(recaptioned).to.not.include('"diff"');
    fs.appendFileSync(
      path.join(fixtureRoot(), "modules", MODULE, "package.json"),
      ",",
    );
    const unreadable = await valueFree("builder_configure_block", {
      path: "/ops/erp-orders#table",
      patch: { caption: "Orders again" },
    });
    expect(unreadable).to.include('"kind":"modify"');
    expect(unreadable).to.not.include('"diff"');
  });
});
