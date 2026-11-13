import { expect } from "chai";
import type {
  MapResourcesInput,
  MappedField,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import { ListPages, MapResources } from "../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { destroyFixture, expectOk } from "./harness";
import { freshApp, ordersFlag, pageSource } from "./helpers/table-view-shop";
import { Column, Relation, STATUS } from "./helpers/shop-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const DESCRIPTIONS = [
  Relation("customers", [
    Column("id", "string", { nullable: false }),
    Column("name", "string"),
    Column("is_active", "boolean"),
  ]),
  Relation("orders", [
    Column("id", "string", { nullable: false }),
    Column("reference", "string"),
    Column("status", "string"),
    Column("unit_price", "number"),
    Column("total", "number"),
    Column("created_at", "date"),
  ]),
];

function codes(result: OpResult<unknown>): string[] {
  return result.ok
    ? (result.warnings ?? []).map((warning) => warning.code)
    : [];
}

function messages(result: OpResult<unknown>): string {
  return JSON.stringify(result.ok ? (result.warnings ?? []) : result.error);
}

function input(
  customers: Partial<MapResourcesInput["resources"][number]> = {},
  orders: Partial<MapResourcesInput["resources"][number]> = {},
): MapResourcesInput {
  return {
    module: MODULE,
    connection: "shop",
    resources: [
      {
        relation: "shop.customers",
        label: "name",
        tableView: true,
        writable: false,
        fields: [{ column: "name" }],
        ...customers,
      },
      {
        relation: "shop.orders",
        label: "reference",
        tableView: true,
        writable: false,
        fields: [
          { column: "reference" },
          { column: "unit_price" },
          { column: "total" },
          { column: "created_at" },
        ],
        ...orders,
      },
    ],
  };
}

async function pageIds(): Promise<string[]> {
  return (await ListPages())
    .map((page) => page.id)
    .sort((a, b) => a.localeCompare(b));
}

function connectTheShopCatalog(): void {
  setCatalogConnectionsForTests({
    shop: {
      async ListRelations() {
        return DESCRIPTIONS;
      },
      async DescribeRelations(relations: string[]) {
        return DESCRIPTIONS.filter((description) =>
          relations.includes(`${description.schema}.${description.name}`),
        );
      },
    },
  });
  setModuleReloadForTests(reloadedAtOnce);
}

describe("a mapping forgives what is clear and harmless, and keeps the other relations", function () {
  this.timeout(OP_TIMEOUT);

  before(connectTheShopCatalog);

  beforeEach(freshApp);

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("writes a boolean column plain when a badge is sent for it", async () => {
    const mapped = await MapResources(
      input({
        fields: [{ column: "name" }, { column: "is_active", display: STATUS }],
      }),
    );
    expectOk(mapped, "MapResources");
    expect(codes(mapped)).to.include("display_dropped");
    expect(messages(mapped)).to.include("is_active");
    expect(await pageIds()).to.deep.equal(["shop-customers", "shop-orders"]);
  });

  it("writes the primary key plain when a display is sent for it", async () => {
    const mapped = await MapResources(
      input(
        {},
        {
          fields: [{ column: "id", display: STATUS }, { column: "reference" }],
        },
      ),
    );
    expectOk(mapped, "MapResources");
    expect(messages(mapped)).to.include("primary key");
    expect(await pageIds()).to.include("shop-orders");
  });

  it("drops a price on a text column and a badge on a number without refusing the batch", async () => {
    const fields: MappedField[] = [
      { column: "reference", display: { kind: "price" } },
      { column: "total", display: STATUS },
    ];
    const mapped = await MapResources(input({}, { fields, tabs: null }));
    expectOk(mapped, "MapResources");
    expect(
      codes(mapped).filter((code) => code === "display_dropped"),
    ).to.have.length(2);
  });

  it("reads a label that is the primary key as the controller's _id", async () => {
    const mapped = await MapResources(input({}, { label: "id" }));
    expectOk(mapped, "MapResources");
    expect(codes(mapped)).to.include("label_changed");
    expect(await pageSource()).to.include('labelKey: "_id"');
  });

  it("marks the columns the views, footer and tabs use filterable or sortable", async () => {
    const mapped = await MapResources(
      input(
        {},
        {
          tableOptions: {
            views: {
              items: [
                {
                  id: "pricey",
                  label: "Pricey",
                  filters: [
                    { column: "unit_price", mode: "greater_than", value: "10" },
                  ],
                  sort: [{ column: "created_at", desc: true }],
                },
              ],
            },
            footer: {
              summary: [
                {
                  label: "Sum",
                  op: "sum",
                  field: "total",
                  where: { column: "unit_price", op: "equals", value: 3 },
                },
              ],
            },
          },
        },
      ),
    );
    expectOk(mapped, "MapResources");
    expect(codes(mapped)).to.include("field_flag_set");
    expect(codes(mapped)).to.not.include("page_not_written");
    expect(await ordersFlag("unit_price", "filterable")).to.equal(true);
    expect(await ordersFlag("created_at", "sortable")).to.equal(true);
  });

  it("writes the other relations when one is refused, and says why", async () => {
    const mapped = await MapResources(
      input({}, { fields: [{ column: "reference" }, { column: "no_such" }] }),
    );
    expectOk(mapped, "MapResources");
    expect(codes(mapped)).to.include("relation_skipped");
    expect(messages(mapped)).to.include("no_such");
    expect(await pageIds()).to.deep.equal(["shop-customers"]);
  });

  it("still refuses a call whose every relation is refused", async () => {
    const refused = await MapResources({
      ...input(),
      resources: [
        {
          relation: "shop.orders",
          tableView: true,
          writable: false,
          fields: [{ column: "no_such" }],
        },
      ],
    });
    expect(refused.ok).to.equal(false);
    expect(messages(refused)).to.include("no_such");
  });
});
