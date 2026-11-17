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
import * as implementation from "../../../../implementations/dms-builder";
import {
  recordWrittenLiterals,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../../implementations/dms-builder/engine";
import { mockupTool, run } from "../../../helpers/mockup-mcp";
import { Column, INFO, Relation } from "../analysis-catalog";
import { createFixture, destroyFixture, type Fixture } from "../harness";
import { MODULE } from "../mapped-database";
import { projectTree } from "./project-files";
import { reloadedAtOnce } from "../reload-stub";

export const CONNECTION = "erp";
export const ORDERS = "erp.orders";

/** Every value the rows of `erp.orders` hold that a profile reads, and the labels and tab ids made of them. */
export const ROW_VALUES = [
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

/** The call that maps `erp.orders`, with `status` drawn as `display` and the columns `keeps` keeps. */
export function mappingOfOrders(
  display: JsonValue,
  keeps = (_column: string) => true,
): JsonValue {
  const columns: { [key: string]: JsonValue; column: string }[] = [
    { column: "id" },
    { column: "status", filterable: true, display },
    { column: "currency" },
    { column: "total", display: { kind: "price" } },
    { column: "placed_at" },
  ];
  const fields = columns.filter((field) => keeps(field.column));
  return {
    module: MODULE,
    connection: CONNECTION,
    resources: [
      {
        relation: ORDERS,
        tableView: true,
        writable: false,
        fields,
      },
    ],
  };
}

export const MAPPED = mappingOfOrders({ kind: "badge", values: 3 });

export const WrittenSchema = z.object({
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

export const PageSchema = z.object({
  data: z.object({ page: z.object({ filepath: z.string() }) }),
});

export const MappingSchema = z.object({
  data: z.array(
    z.object({ resource: z.object({ tabs: z.unknown().optional() }) }),
  ),
});

export const ITEMS_FROM_STATUS = /itemsFrom:\s*\{\s*column:\s*"status"\s*\}/;
export const CURRENCY_FROM_CURRENCY =
  /currencyFrom:\s*\{\s*column:\s*"currency"\s*\}/;
export const TABS_FROM_STATUS = /tabsFrom:\s*\{\s*column:\s*"status"\s*\}/;

let app: Fixture;

/** The fixture the current test runs on. */
export function fixture(): Fixture {
  return app;
}

/** Every file of the mapped module, as one text. */
export function moduleCode(): string {
  return projectTree(app.root, path.join("modules", MODULE));
}

/** Creates the project's own category `pages.ops`. */
export async function createOpsCategory(): Promise<void> {
  await valueFree("builder_create_category", {
    name: "ops",
    displayName: "Ops",
  });
}

/** Calls a tool and answers its text, failing on an error answer or on any value of a row. */
export async function valueFree(
  name: string,
  args: JsonValue,
): Promise<string> {
  const { text, isError } = await run(mockupTool(name), args);
  expect(isError, text).to.equal(false);
  for (const value of ROW_VALUES) {
    expect(text, `${name} answered ${value}`).to.not.include(value);
  }
  return text;
}

export type MappedOrders = z.infer<
  typeof WrittenSchema
>["data"]["resources"][number];

/** Analyses the connection and maps `erp.orders` as sent back from the proposal. */
export async function mapOrders(): Promise<MappedOrders> {
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

/** The badge items of `status` a mapping wrote before references. */
const STATUS_ITEMS = [
  { label: "Zq paid", value: "zq_paid", textColor: "success" },
  { label: "Zq held", value: "zq_held", textColor: "primary" },
  { label: "Zq void", value: "zq_void", textColor: "secondary" },
];

/** The tabs a mapping wrote before references, one per badge item of `status`. */
const STATUS_TABS = [
  { id: "all", label: "All" },
  ...STATUS_ITEMS.map(({ label, value, textColor }) => ({
    id: `status-${value.replace("_", "-")}`,
    label,
    filter: { accessorKey: "status", value, mode: "is" },
    textColor,
  })),
];

/**
 * Leaves the mapped code as dms 0.20.8 and before wrote it: the badge items, the currency and the
 * tabs hold the values of the rows of `erp.orders`, and the module records them as its mapping's.
 */
export async function writtenWithRowValues(
  orders: MappedOrders,
): Promise<void> {
  const edits = [
    await run(mockupTool("builder_configure_field"), {
      path: `${orders.ref}#status`,
      patch: {
        dataType: { $dataType: "select", config: { items: STATUS_ITEMS } },
      },
    }),
    await run(mockupTool("builder_configure_field"), {
      path: `${orders.ref}#total`,
      patch: { dataType: { $dataType: "price", config: { currency: "JPY" } } },
    }),
    await run(mockupTool("builder_configure_block"), {
      path: `${orders.page}#table`,
      patch: { caption: "Orders", tabs: STATUS_TABS },
      replace: true,
    }),
  ];
  for (const { isError, text } of edits) {
    expect(isError, text).to.equal(false);
  }
  recordWrittenLiterals(MODULE, []);
}

/** {@link mapOrders}, then the code left as dms 0.20.8 and before wrote it ({@link writtenWithRowValues}). */
export async function mapOrdersWithRowValues(): Promise<MappedOrders> {
  const orders = await mapOrders();
  await writtenWithRowValues(orders);
  return orders;
}

/** The catalog connection `erp`, which describes and profiles `erp.orders` with the values above in its rows. */
export const ERP_CONNECTION = {
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
};

/** Maps the module's interface and serves `erp.orders` through a catalog connection. */
export function connectDatabase(): void {
  before(() => {
    ImplementInterface(Builder, implementation);
  });

  beforeEach(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ [CONNECTION]: ERP_CONNECTION });
    setModuleReloadForTests(reloadedAtOnce);
  });

  afterEach(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });
}
