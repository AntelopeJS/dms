import type {
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { expect } from "chai";
import { GetMapping } from "../../../../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../../../../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../../../../implementations/dms-builder/engine/module-reload";
import { INFO } from "../analysis-catalog";
import { createFixture, destroyFixture, expectOk } from "../harness";
import { MODULE } from "../mapped-database";
import { reloadedAtOnce } from "../reload-stub";
import { SHOP } from "./shop-orders";

let described = SHOP;

/** Makes the shop connection describe these relations until the next `openShop`. */
export function describeShopAs(relations: RelationDescription[]): void {
  described = relations;
}

export function customers(
  overrides: Partial<MappedResource> = {},
): MappedResource {
  return {
    relation: "shop.customers",
    label: "name",
    tableView: true,
    writable: false,
    fields: [{ column: "name" }],
    ...overrides,
  };
}

export function orders(fields: MappedField[]): MappedResource {
  return {
    relation: "shop.orders",
    label: "reference",
    tableView: true,
    writable: false,
    fields,
  };
}

export function inputOf(...resources: MappedResource[]): MapResourcesInput {
  return { module: MODULE, connection: "shop", resources };
}

export const LEFT_OUT: MappedField[] = [
  { column: "reference" },
  { column: "customer_id", relation: "shop.customers" },
  { column: "status" },
];

export async function labelsOfOrders(): Promise<Record<string, string>> {
  const read = await GetMapping("shop", MODULE);
  expectOk(read, "GetMapping");
  const entry = (read.ok ? read.data : []).find(
    (candidate) => candidate.resource.relation === "shop.orders",
  );
  expect(entry, "orders in GetMapping").to.not.equal(undefined);
  return Object.fromEntries(
    entry!.resource.fields.map((field) => [field.column, field.label.value]),
  );
}

/** A fresh app and a shop connection whose profile always times out. */
export function openShop(): void {
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
}

export function closeShop(): void {
  setCatalogConnectionsForTests();
  setModuleReloadForTests();
  destroyFixture();
}
