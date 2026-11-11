import path from "node:path";
import { expect } from "chai";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import { MapResources } from "../../../implementations/dms-builder";
import {
  type CatalogConnection,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const MODULE = "erp-documents";
const DATABASE = "erp";
const WRITES = { insert: true, update: true, delete: true };

let app: Fixture;

function Column(
  name: string,
  extra: Partial<ColumnDescription> = {},
): ColumnDescription {
  return {
    name,
    native: "string 100%",
    nullable: false,
    hasDefault: false,
    generated: false,
    identity: null,
    accepts: [{ declared: "string" }],
    comment: null,
    ...extra,
  };
}

function Relation(
  name: string,
  key: string,
  columns: ColumnDescription[],
): RelationDescription {
  return {
    schema: DATABASE,
    name,
    kind: "table",
    key: { columns: [key], source: "primary" },
    writes: WRITES,
    columns,
    estimatedRows: null,
    estimate: null,
    comment: null,
    indexes: [],
    references: [],
    referencedBy: [],
  };
}

/**
 * A MongoDB collection keyed by `_id` itself, a RethinkDB table keyed by its `id` field, and one
 * keyed by an array no field type reads.
 */
const DESCRIPTIONS: RelationDescription[] = [
  Relation("orders", "_id", [
    Column("_id", { native: "objectId 100%", hasDefault: true }),
    Column("status"),
    Column("customer", { native: "int 60% | string 40%", accepts: [] }),
  ]),
  Relation("customers", "id", [
    Column("id", { hasDefault: true }),
    Column("name"),
  ]),
  Relation("order_lines", "id", [
    Column("id", { native: "ARRAY 100%", accepts: [], readOnly: "an array" }),
    Column("sku"),
  ]),
];

const CATALOG: Partial<CatalogConnection> = {
  async ListRelations() {
    return DESCRIPTIONS;
  },
  async DescribeRelations(relations: string[]) {
    return DESCRIPTIONS.filter((description) =>
      relations.includes(`${description.schema}.${description.name}`),
    );
  },
};

function moduleFile(relative: string): string {
  return app.read(path.join("..", "modules", MODULE, "src", relative));
}

function Declarations(source: string, name: string): number {
  return source.split(`declare ${name}:`).length - 1;
}

describe("mapping a document source, whose key may be _id itself", function () {
  this.timeout(OP_TIMEOUT);

  let result: Awaited<ReturnType<typeof MapResources>>;

  before(async () => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({ docs: CATALOG });
    setModuleReloadForTests(reloadedAtOnce);
    result = await MapResources({
      module: MODULE,
      connection: "docs",
      resources: [
        {
          relation: "erp.orders",
          label: "status",
          tableView: true,
          writable: true,
          fields: [
            { column: "_id" },
            { column: "status" },
            { column: "customer", declared: "string" },
          ],
        },
        {
          relation: "erp.customers",
          label: "name",
          tableView: true,
          writable: true,
          fields: [{ column: "name" }],
        },
        {
          relation: "erp.order_lines",
          label: "sku",
          tableView: true,
          writable: false,
          fields: [{ column: "sku" }],
        },
      ],
    });
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("declares a key column named _id once, as the alias, and a field-type answer, in a module that typechecks", () => {
    expectOk(result, "MapResources");
    const orders = moduleFile("erp/orders/database.ts");
    expect(Declarations(orders, "_id")).to.equal(1);
    expect(Declarations(orders, "status")).to.equal(1);
    expect(orders).to.include('@Field("string") declare customer: string;');
  });

  it("still declares a key field of another name beside _id", () => {
    const customers = moduleFile("erp/customers/database.ts");
    expect(Declarations(customers, "_id")).to.equal(1);
    expect(Declarations(customers, "id")).to.equal(1);
  });

  it("serves a key column no field type reads through _id alone", () => {
    const lines = moduleFile("erp/order-lines/database.ts");
    expect(Declarations(lines, "_id")).to.equal(1);
    expect(Declarations(lines, "id")).to.equal(0);
  });
});
