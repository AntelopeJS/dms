import { expect } from "chai";
import {
  ConfigurePage,
  CreateCategory,
  ListCategories,
  MapResources,
} from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  freshApp,
  installShopCatalog,
  ordersInput,
  ordersPage,
  pageSource,
  removeShopCatalog,
} from "./helpers/table-view-shop";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

describe("the page options of a mapped table", function () {
  this.timeout(OP_TIMEOUT);

  before(installShopCatalog);

  beforeEach(freshApp);

  after(removeShopCatalog);

  it("keeps the order and icon a page has when a remap leaves them out, and updates them when sent", async () => {
    expectOk(
      await MapResources(ordersInput({ icon: "i-ph-receipt", order: 130 })),
      "first",
    );
    expectOk(await MapResources(ordersInput()), "remap without");
    let page = await ordersPage();
    expect([page.icon, page.order]).to.deep.equal(["i-ph-receipt", 130]);
    expectOk(
      await MapResources(ordersInput({ icon: "i-ph-package", order: 105 })),
      "remap with",
    );
    page = await ordersPage();
    expect([page.icon, page.order]).to.deep.equal(["i-ph-package", 105]);
  });

  it("gives an order to a page mapped before orders were written", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = await ordersPage();
    expectOk(
      await ConfigurePage(page.ref, { order: undefined }),
      "ConfigurePage",
    );
    expect((await ordersPage()).order).to.equal(undefined);
    expectOk(await MapResources(ordersInput()), "remap");
    expect((await ordersPage()).order).to.equal(100);
  });

  it("updates the title, icon, description and order of a mapped page through ConfigurePage", async () => {
    expectOk(await MapResources(ordersInput()), "MapResources");
    const page = await ordersPage();
    expectOk(
      await ConfigurePage(page.ref, {
        displayName: "Customer orders",
        icon: "i-ph-receipt",
        description: "Orders by status.",
        order: 101,
      }),
      "ConfigurePage",
    );
    const after = await ordersPage();
    expect([after.displayName, after.icon, after.order]).to.deep.equal([
      "Customer orders",
      "i-ph-receipt",
      101,
    ]);
    expect(await pageSource()).to.include('description: "Orders by status."');
  });

  it("names a page by its humanized relation name when the mapping sends no title", async () => {
    expectOk(
      await MapResources({
        module: MODULE,
        connection: "shop",
        resources: [
          {
            relation: "shop.orders",
            tableView: true,
            writable: false,
            fields: [{ column: "reference" }],
          },
        ],
      }),
      "MapResources",
    );
    expect((await ordersPage()).displayName).to.equal("Orders");
  });

  it("keeps a category created beforehand", async () => {
    expectOk(
      await CreateCategory({
        name: "shop",
        displayName: "Shop",
        module: MODULE,
      }),
      "CreateCategory",
    );
    expectOk(await MapResources(ordersInput()), "MapResources");
    expect(
      (await ListCategories()).map((category) => category.displayName),
    ).to.include("Shop");
  });
});
