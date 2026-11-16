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
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../../implementations/dms-builder/engine";
import { mockupTool, run } from "../../../helpers/mockup-mcp";
import { Column, INFO, Relation } from "../analysis-catalog";
import { createFixture, destroyFixture, type Fixture } from "../harness";
import { MODULE } from "../mapped-database";
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

/** The call that maps `erp.orders`, with `status` drawn as `display`. */
export function mappingOfOrders(display: JsonValue): JsonValue {
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

let app: Fixture;

/** The fixture the current test runs on. */
export function fixture(): Fixture {
  return app;
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

/** Maps the module's interface and serves `erp.orders` through a catalog connection. */
export function connectDatabase(): void {
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
