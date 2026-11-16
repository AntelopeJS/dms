import fs from "node:fs";
import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import type {
  MeasureValue,
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { mockupTool, run } from "../../helpers/mockup-mcp";
import { Column, INFO, Relation } from "./analysis-catalog";
import { createFixture, destroyFixture, type Fixture } from "./harness";
import { projectFile } from "./helpers/project-files";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const CONNECTION = "erp";
const ORDERS = "erp.orders";

/** Every value the rows of `erp.orders` hold that a profile reads, and the labels and tab ids made of them. */
const ROW_VALUES = [
  "zq_paid",
  "zq_held",
  "zq_void",
  "Zq paid",
  "Zq held",
  "Zq void",
  "zq-paid",
  "zq-held",
  "zq-void",
  "JPY",
  "4471.5",
  "9901.25",
  "1987-03-14",
  "2031-09-02",
  "2031-07",
  "2031-09",
];

function ok<T>(value: T): MeasureValue<T> {
  return { status: "ok", value };
}

const DESCRIPTIONS: RelationDescription[] = [
  Relation({
    relation: ORDERS,
    key: ["id"],
    columns: [
      Column("id", "string", { nullable: false }),
      Column("status", "string"),
      Column("currency", "string"),
      Column("total", "number"),
      Column("placed_at", "date"),
    ],
  }),
];

const PROFILE: RelationProfile = {
  relation: ORDERS,
  rows: ok({ rows: 10, exact: true }),
  sample: null,
  columns: [
    {
      name: "id",
      traits: ["identifier-like"],
      nulls: ok(0),
      distinct: ok(10),
    },
    {
      name: "status",
      traits: ["enum-like"],
      nulls: ok(0),
      distinct: ok(3),
      length: ok({ min: 7, avg: 7, max: 7 }),
      categories: ok({
        values: [
          { value: "zq_paid", rows: 5 },
          { value: "zq_held", rows: 3 },
          { value: "zq_void", rows: 2 },
        ],
        other: 0,
      }),
    },
    {
      name: "currency",
      traits: ["enum-like"],
      nulls: ok(0),
      distinct: ok(1),
      categories: ok({ values: [{ value: "JPY", rows: 10 }], other: 0 }),
    },
    {
      name: "total",
      traits: ["measure"],
      nulls: ok(0),
      range: ok({ min: 4471.5, max: 9901.25 }),
    },
    {
      name: "placed_at",
      traits: ["time-axis"],
      nulls: ok(0),
      range: ok({
        min: "1987-03-14T08:00:00.000Z",
        max: "2031-09-02T08:00:00.000Z",
      }),
      months: ok([
        { month: "2031-07", rows: 4 },
        { month: "2031-09", rows: 6 },
      ]),
    },
  ],
  references: [],
  inbound: [],
};

/** The call that maps `erp.orders`, with `status` drawn as `display`. */
function mappingOfOrders(display: JsonValue): JsonValue {
  return {
    module: MODULE,
    connection: CONNECTION,
    resources: [
      {
        relation: ORDERS,
        tableView: true,
        writable: false,
        fields: [
          { column: "id" },
          { column: "status", filterable: true, display },
          { column: "currency" },
          { column: "total", display: { kind: "price" } },
          { column: "placed_at" },
        ],
      },
    ],
  };
}

const MAPPED = mappingOfOrders({ kind: "badge", values: 3 });

const WrittenSchema = z.object({
  data: z.object({
    resources: z.array(
      z.object({
        ref: z.string(),
        page: z.string(),
        files: z.array(z.string()),
      }),
    ),
  }),
});

const PageSchema = z.object({
  data: z.object({ page: z.object({ filepath: z.string() }) }),
});

/** Tabs the AI writes itself over the mapped `status` column, with values no row holds. */
const OWN_TABS: JsonValue = [
  { id: "all", label: "All" },
  {
    id: "own-open",
    label: "Own open",
    filter: { accessorKey: "status", value: "own_open", mode: "is" },
  },
];

/** A select the AI writes itself on a form field, of values no row holds. */
const OWN_SELECT: JsonValue = {
  $dataType: "select",
  config: { items: [{ label: "Own low", value: "own_low" }] },
};

/** The record of a mapped module's `package.json`, as far as a test rewrites it. */
const ManifestSchema = z
  .object({
    dmsBuilder: z
      .object({
        database: z.object({ rowLiterals: z.array(z.string()) }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

let app: Fixture;

/**
 * Leaves the mapped module's record as dms wrote it before it recorded row values, and answers
 * how to put the record back.
 */
function unrecordRowLiterals(): () => void {
  const manifest = path.join(app.root, "modules", MODULE, "package.json");
  const record = ManifestSchema.parse(
    JSON.parse(projectFile(app.root, path.relative(app.root, manifest))),
  );
  const { rowLiterals, ...unrecorded } = record.dmsBuilder.database;
  expect(rowLiterals).to.not.have.lengthOf(0);
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      ...record,
      dmsBuilder: { ...record.dmsBuilder, database: unrecorded },
    }),
  );
  return () => fs.writeFileSync(manifest, JSON.stringify(record));
}

/** Calls a tool and answers its text, failing on an error answer or on any value of a row. */
async function valueFree(name: string, args: JsonValue): Promise<string> {
  const { text, isError } = await run(mockupTool(name), args);
  expect(isError, text).to.equal(false);
  for (const value of ROW_VALUES) {
    expect(text, `${name} answered ${value}`).to.not.include(value);
  }
  return text;
}

type MappedOrders = z.infer<typeof WrittenSchema>["data"]["resources"][number];

/** Analyses the connection and maps `erp.orders` as sent back from the proposal. */
async function mapOrders(): Promise<MappedOrders> {
  await valueFree("builder_analyse_database", {
    connection: CONNECTION,
    module: MODULE,
  });
  const written = WrittenSchema.parse(
    JSON.parse(await valueFree("builder_map_resources", MAPPED)),
  );
  const [orders] = written.data.resources;
  if (orders === undefined) {
    expect.fail("builder_map_resources mapped no resource");
  }
  return orders;
}

/** Maps the module's interface and serves `erp.orders` through a catalog connection. */
function connectDatabase(): void {
  before(() => {
    ImplementInterface(Builder, implementation);
  });

  beforeEach(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      [CONNECTION]: {
        async Info() {
          return INFO;
        },
        async ListRelations() {
          return DESCRIPTIONS;
        },
        async DescribeRelations() {
          return DESCRIPTIONS;
        },
        async Profile() {
          return PROFILE;
        },
        async CheckReference() {
          return ok({
            containment: 1,
            checkedRows: 10,
            sampled: false,
            targetIsKey: true,
          });
        },
      },
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  afterEach(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });
}

/**
 * The AI gets the shape of a connected database, never its values. Each tool that reads the
 * database answers with every value above left out; an implementation that passes a profile's
 * range, category values or months through, or a proposal's badge items or currency, or a written
 * file's diff, fails here.
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

  it("writes the badge and the currency it reads itself when they are sent back as shown, and answers neither", async () => {
    await valueFree("builder_analyse_database", {
      connection: CONNECTION,
      module: MODULE,
    });
    const written = WrittenSchema.parse(
      JSON.parse(await valueFree("builder_map_resources", MAPPED)),
    );
    const code = written.data.resources
      .flatMap((resource) => resource.files)
      .map((file) => projectFile(app.root, path.relative(app.root, file)))
      .join("\n");
    expect(code).to.include("zq_paid");
    expect(code).to.include("JPY");
    const mapping = await valueFree("builder_mapping", {
      connection: CONNECTION,
      module: MODULE,
    });
    expect(mapping).to.include('{"kind":"badge","values":3}');
  });
});

/**
 * The code a mapping wrote holds badge items, tabs and a currency read from rows. Each builder tool
 * that reads or edits that code answers with every value above left out; an implementation that
 * shows a structure or a diff of the mapped code, or of a mapped page moved out of its module,
 * fails here, and so does one that lets an edit drop what it hides.
 */
describe("[unit] the builder tools over a mapped module's code answer no value of a row", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("reads the code it wrote back with the values it read from rows hidden, and keeps them on an edit", async () => {
    const orders = await mapOrders();
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
      .map((file) => projectFile(app.root, path.relative(app.root, file)))
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
      path.join(app.root, "modules", MODULE, "package.json"),
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

/**
 * Over a mapped resource, the AI writes tabs and select items of its own. Each builder tool that
 * reads a page answers those as written and the mapping's still hidden; an implementation that
 * hides every literal of code over a mapped module fails here.
 */
describe("[unit] the builder tools over a mapped resource answer the literals the AI wrote", function () {
  this.timeout(OP_TIMEOUT);

  connectDatabase();

  it("shows the tabs and select items the AI wrote over a mapped resource, beside the hidden ones the mapping wrote", async () => {
    const orders = await mapOrders();
    await valueFree("builder_add_block", {
      page: orders.page,
      name: "mine",
      type: "TableView",
      controller: orders.ref,
      config: { caption: "Mine", tabs: OWN_TABS },
    });
    await valueFree("builder_add_block", {
      page: orders.page,
      name: "note",
      type: "Form",
      config: { fields: [{ id: "priority", type: OWN_SELECT }] },
    });
    const mappedPage = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(mappedPage).to.include('"tabs":{"$hidden":4}');
    expect(mappedPage).to.include(JSON.stringify(OWN_TABS));
    expect(mappedPage).to.include(JSON.stringify(OWN_SELECT));
    const restore = unrecordRowLiterals();
    const mappedBefore = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(mappedBefore).to.not.include("own_open");
    expect(mappedBefore).to.not.include("own_low");
    restore();
    await valueFree("builder_create_category", {
      name: "ops",
      displayName: "Ops",
    });
    await valueFree("builder_create_page", {
      name: "own-orders",
      displayName: "Own orders",
      category: "pages.ops",
    });
    await valueFree("builder_add_block", {
      page: "/ops/own-orders",
      name: "table",
      type: "TableView",
      controller: orders.ref,
      config: { caption: "Own orders", tabs: OWN_TABS },
    });
    const ownPage = await valueFree("builder_page_structure", {
      pageRef: "/ops/own-orders",
    });
    expect(ownPage).to.include(JSON.stringify(OWN_TABS));
    expect(ownPage).to.not.include("$hidden");
  });

  it("keeps a mapped badge and its tabs hidden once a person relabels one of their items", async () => {
    const orders = await mapOrders();
    const page = PageSchema.parse(
      JSON.parse(
        await valueFree("builder_page_structure", { pageRef: orders.page }),
      ),
    ).data.page.filepath;
    for (const file of [...orders.files, page]) {
      const code = projectFile(app.root, path.relative(app.root, file));
      fs.writeFileSync(file, code.replaceAll("Zq paid", "Settled"));
    }
    const fields = await valueFree("builder_resource_structure", {
      ref: orders.ref,
    });
    expect(fields).to.include('"items":{"$hidden":3}');
    const tabs = await valueFree("builder_page_structure", {
      pageRef: orders.page,
    });
    expect(tabs).to.include('"tabs":{"$hidden":4}');
  });

  it("keeps the tabs of a moved page hidden when a module mapped before dms recorded them drops its badge", async () => {
    const orders = await mapOrders();
    unrecordRowLiterals();
    await valueFree("builder_create_category", {
      name: "ops",
      displayName: "Ops",
    });
    await valueFree("builder_configure_page", {
      pageRef: orders.page,
      patch: { category: "pages.ops" },
    });
    await valueFree("builder_map_resources", mappingOfOrders(null));
    const moved = await valueFree("builder_page_structure", {
      pageRef: "/ops/erp-orders",
    });
    expect(moved).to.include('"tabs":{"$hidden":4}');
  });
});
