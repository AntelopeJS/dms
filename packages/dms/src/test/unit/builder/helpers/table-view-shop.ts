import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import type {
  MapResourcesInput,
  MappedResource,
  OpResult,
  TableViewSettings,
} from "@antelopejs/interface-dms-builder";
import {
  ConfigureTableView,
  GetResourceStructure,
  ListPages,
  ListResources,
  MapResources,
} from "../../../../implementations/dms-builder";
import {
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
  getWritableProject,
  invalidateResourceIndex,
  invalidateSourceIndex,
} from "../../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
  snapshotFixture,
} from "../harness";
import { MODULE } from "../mapped-database";
import { reloadedAtOnce } from "../reload-stub";
import { fileText } from "./file-text";
import { Column, Relation, STATUS } from "./shop-orders";

let current: Fixture | undefined;

/** A fresh app for the engine to rewrite; the one the helpers below read. */
export function freshApp(): Fixture {
  current = createFixture({ modules: [MODULE] });
  return current;
}

let mapped = false;

/**
 * A fresh app with the shop mapped by {@link ordersInput}. The first call maps
 * it and snapshots the result; later calls copy that snapshot back, until
 * {@link removeShopCatalog}.
 */
export async function freshMappedApp(): Promise<Fixture> {
  if (mapped) {
    current = createFixture({ fromSnapshot: true });
    return current;
  }
  const fixture = freshApp();
  expectOk(await MapResources(ordersInput()), "MapResources");
  snapshotFixture();
  mapped = true;
  return fixture;
}

function app(): Fixture {
  if (!current) {
    throw new Error("freshApp() was not called");
  }
  return current;
}

const DESCRIPTIONS = [
  Relation("customers", [
    Column("id", "string", { nullable: false }),
    Column("name", "string"),
  ]),
  Relation("orders", [
    Column("id", "string", { nullable: false }),
    Column("reference", "string"),
    Column("status", "string"),
    Column("channel", "string"),
    Column("total", "number"),
    Column("created_at", "date"),
  ]),
];
/** The shop connection the specs map, answering from the descriptions above. */
export function installShopCatalog(): void {
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

export function removeShopCatalog(): void {
  setCatalogConnectionsForTests();
  setModuleReloadForTests();
  destroyFixture();
  mapped = false;
}

export function ordersInput(
  extra: Partial<MappedResource> = {},
): MapResourcesInput {
  return {
    module: MODULE,
    connection: "shop",
    resources: [
      {
        relation: "shop.customers",
        tableView: true,
        writable: false,
        fields: [{ column: "name" }],
      },
      {
        relation: "shop.orders",
        label: "reference",
        tableView: true,
        writable: false,
        fields: [
          { column: "reference" },
          { column: "status", filterable: true, display: STATUS },
          { column: "channel", filterable: true },
          { column: "total", display: { kind: "price" } },
          { column: "created_at", sortable: true },
        ],
        ...extra,
      },
    ],
  };
}

export function ordersPage() {
  return ListPages().then((pages) => {
    const page = pages.find((entry) => entry.id === "shop-orders");
    expect(page, "the orders page").to.not.equal(undefined);
    return page!;
  });
}

/** Where the orders controller is written. */
export function ordersControllerPath(): string {
  return path.join(
    app().root,
    "modules",
    MODULE,
    "src",
    "shop/orders/data-api.ts",
  );
}

/**
 * Rewrites the orders controller's text while the engine holds the project in
 * memory, as a developer editing a file under a running builder does, then lets
 * the engine read the file again.
 */
export function editOrdersController(edit: (text: string) => string): void {
  getWritableProject();
  const file = ordersControllerPath();
  fs.writeFileSync(file, edit(fs.readFileSync(file, "utf8")));
  invalidateSourceIndex();
  invalidateResourceIndex();
}

/** The orders controller's text. */
export function ordersControllerText(): string {
  return fs.readFileSync(ordersControllerPath(), "utf8");
}

export async function pageSource(): Promise<string> {
  return fileText((await ordersPage()).filepath).replace(/\s+/g, " ");
}

/** The error a refused operation answered, as text. */
export function refusal(result: OpResult<unknown>): string {
  expect(result.ok, "the settings are refused").to.equal(false);
  return JSON.stringify(result.ok ? "" : result.error);
}

/** Sets the options on the orders page and expects them written. */
export async function configure(settings: TableViewSettings) {
  const page = await ordersPage();
  const result = await ConfigureTableView(page.ref, settings);
  expectOk(result, "ConfigureTableView");
  return result.ok ? result : { changes: [], warnings: undefined };
}

/** Whether the orders controller lets the TableView filter or sort on a column. */
export async function ordersFlag(
  column: string,
  flag: "filterable" | "sortable",
): Promise<boolean | undefined> {
  const orders = (await ListResources()).find(
    (resource) => resource.tableName === "orders",
  );
  expect(orders, "the orders resource").to.not.equal(undefined);
  const structure = await GetResourceStructure(orders!.ref);
  expectOk(structure, "GetResourceStructure");
  return structure.ok
    ? structure.data.fields.find((field) => field.name === column)?.[flag]
    : undefined;
}
