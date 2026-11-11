import { expect } from "chai";
import type {
  MappedField,
  MappedRelation,
  MappedResource,
} from "@antelopejs/interface-dms-builder";
import { GetMapping, MapResources } from "../../../implementations/dms-builder";
import { setCatalogConnectionsForTests } from "../../../implementations/dms-builder/engine/catalog-connection";
import { setModuleReloadForTests } from "../../../implementations/dms-builder/engine/module-reload";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import {
  ordersInput,
  SHOP,
  STATUS,
  handEditedTabs,
  pageText,
} from "./helpers/shop-orders";
import { projectFile } from "./helpers/project-files";
import { installedPriceTypeHasCurrency } from "./helpers/installed-interface";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";
import path from "node:path";

let app: Fixture;

function moduleFile(relative: string): string {
  return projectFile(app.root, path.join("modules", MODULE, "src", relative));
}

function echoed(entry: MappedRelation): MappedResource {
  const { resource } = entry;
  const mapped: MappedResource = {
    relation: resource.relation,
    title: resource.title.value,
    tableView: resource.tableView.value,
    writable: resource.writable.value,
    fields: resource.fields
      .filter((field) => entry.included.includes(field.column))
      .map((field) => {
        const sent: MappedField = {
          column: field.column,
          label: field.label.value,
          listable: field.listable.value,
          filterable: field.filterable.value,
          sortable: field.sortable.value,
          searchable: field.searchable.value,
        };
        if (field.relation) {
          sent.relation = field.relation.value;
        } else {
          sent.declared = field.declared.value;
        }
        if (field.display) {
          sent.display = field.display.value;
        }
        return sent;
      }),
  };
  if (resource.label.value) {
    mapped.label = resource.label.value;
  }
  if (resource.tabs) {
    mapped.tabs = resource.tabs.value;
  }
  return mapped;
}

async function ordersMapped(): Promise<MappedRelation> {
  const read = await GetMapping("shop", MODULE);
  expectOk(read, "GetMapping");
  const found = (read.ok ? read.data : []).find(
    (entry) => entry.resource.relation === "shop.orders",
  );
  expect(found, "shop.orders mapped").to.not.equal(undefined);
  return found!;
}

/** The orders mapped with tabs, then the page's tabs replaced the way a person editing the page would. */
describe("mapping columns with a display and a TableView with tabs", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      shop: {
        async ListRelations() {
          return SHOP;
        },
        async DescribeRelations(relations: string[]) {
          return SHOP.filter((description) =>
            relations.includes(`${description.schema}.${description.name}`),
          );
        },
      },
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  it("writes a badge as a select of toned items, a price as the price DataType, and the relation under its label", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include("new DefaultDataTypes.SelectType({");
    expect(orders).to.include(
      '{ label: "Paid", value: "paid", textColor: "success" }',
    );
    expect(orders).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(orders).to.include('name: "Customer"');
    expect(moduleFile("shop/orders/database.ts")).to.include(
      '@Field("string") declare status: string;',
    );
  });

  it("writes a price with its currency, reads it back, and writes it plain with a warning when the code is not one", async function () {
    if (!installedPriceTypeHasCurrency()) {
      this.skip();
    }
    const fields = (currency: string) => [
      { column: "reference" },
      { column: "status", filterable: true, display: STATUS },
      { column: "total", display: { kind: "price" as const, currency } },
    ];
    expectOk(
      await MapResources(ordersInput({ fields: fields("USD") })),
      "MapResources",
    );
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      'new DefaultDataTypes.PriceType({ currency: "USD" })',
    );
    const read = await ordersMapped();
    expect(
      read.resource.fields.find((field) => field.column === "total")?.display
        ?.value,
    ).to.deep.equal({ kind: "price", currency: "USD" });

    const refused = await MapResources(
      ordersInput({ fields: fields("dollars") }),
    );
    expectOk(refused, "MapResources with a bad currency");
    expect(
      refused.ok && refused.warnings?.map((warning) => warning.code),
    ).to.include("display_dropped");
    expect(moduleFile("shop/orders/data-api.ts")).to.not.include("currency:");
  });

  it("writes the tabs: All, then a tab per value in the badge's order, in its tone", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = (await pageText()).replace(/\s+/g, " ");
    expect(page).to.include('{ id: "all", label: "All" }');
    expect(page).to.include(
      '{ id: "status-paid", label: "Paid", filter: { accessorKey: "status", value: "paid", mode: "is" }, textColor: "success", }',
    );
    expect(page.indexOf("status-paid")).to.be.lessThan(
      page.indexOf("status-pending"),
    );
  });

  it("reads the display and the tabs back, and a remap that sends them back changes nothing", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const read = await ordersMapped();
    const status = read.resource.fields.find(
      (field) => field.column === "status",
    );
    expect(status?.display?.value).to.deep.equal(STATUS);
    expect(
      read.resource.fields.find((field) => field.column === "total")?.display
        ?.value,
    ).to.deep.equal({ kind: "price" });
    expect(read.resource.tabs?.value).to.deep.equal({ column: "status" });
    const remapped = await MapResources({
      module: MODULE,
      connection: "shop",
      resources: [echoed(read)],
    });
    expectOk(remapped, "MapResources from GetMapping");
    expect(
      remapped.ok && remapped.changes.map((change) => change.diff),
    ).to.deep.equal([]);
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      "new DefaultDataTypes.SelectType({",
    );
  });

  it("keeps the tabs a person edited on the page when a remap sends the mapping back", async () => {
    await handEditedTabs();
    const read = await ordersMapped();
    expect(read.resource.tabs).to.equal(undefined);
    expectOk(
      await MapResources({
        module: MODULE,
        connection: "shop",
        resources: [echoed(read)],
      }),
      "MapResources after a hand edit",
    );
    const page = await pageText();
    expect(page).to.include('label: "Everything"');
    expect(page).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      "new DefaultDataTypes.SelectType({",
    );
  });

  it("writes the plain column when the display is null, and leaves the tabs the page holds", async () => {
    await handEditedTabs();
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total", display: null },
          ],
          tabs: null,
        }),
      ),
      "MapResources without displays",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
    expect(await pageText()).to.include('label: "Everything"');
  });
});
