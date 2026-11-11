import { expect } from "chai";
import type {
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { GetMapping, MapResources } from "../../../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../../../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../../../implementations/dms-builder/engine/module-reload";
import { INFO } from "./analysis-catalog";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { SHOP } from "./helpers/shop-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

let described: RelationDescription[] = SHOP;

function customers(overrides: Partial<MappedResource> = {}): MappedResource {
  return {
    relation: "shop.customers",
    label: "name",
    tableView: true,
    writable: false,
    fields: [{ column: "name" }],
    ...overrides,
  };
}

function orders(fields: MappedField[]): MappedResource {
  return {
    relation: "shop.orders",
    label: "reference",
    tableView: true,
    writable: false,
    fields,
  };
}

function inputOf(...resources: MappedResource[]): MapResourcesInput {
  return { module: MODULE, connection: "shop", resources };
}

const PLAIN: MappedField[] = [
  { column: "reference" },
  { column: "customer_id" },
  { column: "status" },
];

async function customerRelation(): Promise<string | undefined> {
  const read = await GetMapping("shop", MODULE);
  expectOk(read, "GetMapping");
  const entry = (read.ok ? read.data : []).find(
    (candidate) => candidate.resource.relation === "shop.orders",
  );
  expect(entry, "orders in GetMapping").to.not.equal(undefined);
  return entry!.resource.fields.find((field) => field.column === "customer_id")
    ?.relation?.value;
}

describe("mapping a declared foreign key left without a relation", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    described = SHOP;
    createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async Info() {
          return INFO;
        },
        async ListRelations() {
          return described;
        },
        async DescribeRelations(relations: string[]) {
          return described.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
        async Profile() {
          throw new Error("the profile timed out");
        },
        async CheckReference() {
          return {
            status: "ok",
            value: {
              containment: 1,
              checkedRows: 10,
              sampled: false,
              targetIsKey: true,
            },
          };
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

  it("makes the column a relation column onto a target of the batch", async () => {
    expectOk(
      await MapResources(inputOf(customers(), orders(PLAIN))),
      "MapResources",
    );
    expect(await customerRelation()).to.equal("shop.customers");
  });

  it("makes the column a relation column onto a target mapped by an earlier call", async () => {
    expectOk(await MapResources(inputOf(customers())), "target alone");
    expectOk(await MapResources(inputOf(orders(PLAIN))), "orders alone");
    expect(await customerRelation()).to.equal("shop.customers");
  });

  it("writes the column plain when the call sends a null relation", async () => {
    expectOk(
      await MapResources(
        inputOf(
          customers(),
          orders([{ column: "customer_id", relation: null }]),
        ),
      ),
      "MapResources",
    );
    expect(await customerRelation()).to.equal(undefined);
  });

  it("writes the column plain, and keeps the relation, when the target is not mapped", async () => {
    const result = await MapResources(inputOf(orders(PLAIN)));
    expectOk(result, "MapResources");
    expect(await customerRelation()).to.equal(undefined);
    const warnings = result.ok ? (result.warnings ?? []) : [];
    expect(warnings.map((warning) => warning.code)).to.not.include(
      "relation_skipped",
    );
  });
});
