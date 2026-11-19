import { expect } from "chai";
import type { MappedResource } from "@antelopejs/interface-dms-builder";
import {
  ConfigurePage,
  CreateCategory,
  ListPages,
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

async function createSection(name: string): Promise<string> {
  const created = await CreateCategory({
    name,
    displayName: name.toUpperCase(),
    module: MODULE,
  });
  expectOk(created, `CreateCategory ${name}`);
  return created.ok ? created.data.ref : "";
}

async function ordersPages() {
  return (await ListPages()).filter((page) => page.id === "shop-orders");
}

function ordersOnly(extra: Partial<MappedResource> = {}) {
  const input = ordersInput(extra);
  return { ...input, resources: [input.resources[1]] };
}

describe("the category of a mapped table's page", function () {
  this.timeout(OP_TIMEOUT);

  before(installShopCatalog);

  beforeEach(freshApp);

  after(removeShopCatalog);

  it("writes a new page inside the category the resource names", async () => {
    const section = await createSection("sales");
    const result = await MapResources(ordersInput({ category: section }));
    expectOk(result, "MapResources");
    const pages = await ordersPages();
    expect(pages.map((page) => page.category)).to.deep.equal([section]);
    expect(result.ok && result.data.resources[1].page).to.equal(pages[0].ref);
  });

  it("leaves the connection's category alone when every page names its own", async () => {
    const section = await createSection("sales");
    const input = ordersOnly({ category: section });
    expectOk(await MapResources(input), "MapResources");
    expect((await ordersPages()).map((page) => page.category)).to.deep.equal([
      section,
    ]);
  });

  it("refuses a category that does not exist, naming the resource", async () => {
    const result = await MapResources(
      ordersOnly({ category: "pages.nowhere" }),
    );
    expect(result.ok).to.equal(false);
    const text = JSON.stringify(result.ok ? "" : result.error);
    expect(text).to.include("shop.orders");
    expect(text).to.include("pages.nowhere");
    expect(await ordersPages()).to.have.length(0);
  });

  it("refuses a category another module declares, naming the resource and the module", async () => {
    const created = await CreateCategory({
      name: "elsewhere",
      displayName: "Elsewhere",
    });
    expectOk(created, "CreateCategory");
    const result = await MapResources(
      ordersOnly({ category: created.ok ? created.data.ref : "" }),
    );
    expect(result.ok).to.equal(false);
    const text = JSON.stringify(result.ok ? "" : result.error);
    expect(text).to.include("shop.orders");
    expect(text).to.include(MODULE);
    expect(await ordersPages()).to.have.length(0);
  });

  it("updates the page a person moved into a category instead of writing a second one", async () => {
    const section = await createSection("sales");
    expectOk(await MapResources(ordersInput()), "first");
    const original = await ordersPage();
    expectOk(
      await ConfigurePage(original.ref, {
        category: section,
        icon: "i-ph-receipt",
        order: 120,
      }),
      "move",
    );
    const input = ordersInput();
    input.resources[1].fields.push({ column: "id" });
    const remap = await MapResources(input);
    expectOk(remap, "remap");
    const pages = await ordersPages();
    expect(
      pages.map((page) => [page.category, page.icon, page.order]),
    ).to.deep.equal([[section, "i-ph-receipt", 120]]);
    expect(remap.ok && remap.data.resources[1].page).to.equal(pages[0].ref);
    expect(await pageSource()).to.include("caption");
  });

  it("moves a page found by its controller to the category a remap names", async () => {
    const first = await createSection("sales");
    const second = await createSection("archive");
    expectOk(await MapResources(ordersInput()), "first");
    expectOk(
      await ConfigurePage((await ordersPage()).ref, { category: first }),
      "move",
    );
    const remap = await MapResources(ordersInput({ category: second }));
    expectOk(remap, "remap");
    const pages = await ordersPages();
    expect(pages.map((page) => page.category)).to.deep.equal([second]);
    expect(remap.ok && remap.data.resources[1].page).to.equal(pages[0].ref);
  });

  it("removes a moved page whose relation lost its TableView", async () => {
    const section = await createSection("sales");
    expectOk(await MapResources(ordersInput()), "first");
    expectOk(
      await ConfigurePage((await ordersPage()).ref, { category: section }),
      "move",
    );
    expectOk(
      await MapResources(ordersInput({ tableView: false })),
      "remap without TableView",
    );
    expect(await ordersPages()).to.have.length(0);
  });
});

describe("the caption of a mapped table", function () {
  this.timeout(OP_TIMEOUT);

  before(installShopCatalog);

  beforeEach(freshApp);

  after(removeShopCatalog);

  it("is the page's title on a new page, a remap and a moved page", async () => {
    const section = await createSection("sales");
    expectOk(await MapResources(ordersInput({ title: "Orders" })), "first");
    expect(await pageSource()).to.match(/caption: "Orders"/);
    expectOk(
      await MapResources(ordersInput({ title: "Customer orders" })),
      "remap",
    );
    expect(await pageSource()).to.match(/caption: "Customer orders"/);
    expectOk(
      await ConfigurePage((await ordersPage()).ref, { category: section }),
      "move",
    );
    expectOk(
      await MapResources(ordersInput({ title: "Sales orders" })),
      "remap moved",
    );
    expect(await pageSource()).to.match(/caption: "Sales orders"/);
  });

  it("keeps a custom title and caption when a remap sends no title", async () => {
    expectOk(
      await MapResources(ordersInput({ title: "Sales orders" })),
      "first",
    );
    expectOk(await MapResources(ordersInput()), "remap");
    expect(await pageSource()).to.match(/caption: "Sales orders"/);
    expect((await ordersPage()).displayName).to.equal("Sales orders");
  });

  it("keeps a custom title and caption on a page moved into a category when a remap sends no title", async () => {
    const section = await createSection("sales");
    expectOk(
      await MapResources(ordersInput({ title: "Sales orders" })),
      "first",
    );
    expectOk(
      await ConfigurePage((await ordersPage()).ref, { category: section }),
      "move",
    );
    expectOk(await MapResources(ordersInput()), "remap moved");
    const page = await ordersPage();
    expect([page.category, page.displayName]).to.deep.equal([
      section,
      "Sales orders",
    ]);
    expect(await pageSource()).to.match(/caption: "Sales orders"/);
  });

  it("keeps the title when a remap moving the page into a category sends none", async () => {
    const section = await createSection("sales");
    expectOk(
      await MapResources(ordersInput({ title: "Sales orders" })),
      "first",
    );
    expectOk(
      await MapResources(ordersInput({ category: section })),
      "remap with category",
    );
    const page = await ordersPage();
    expect([page.category, page.displayName]).to.deep.equal([
      section,
      "Sales orders",
    ]);
    expect(await pageSource()).to.match(/caption: "Sales orders"/);
  });

  it("keeps the title when a remap sends a blank one", async () => {
    expectOk(
      await MapResources(ordersInput({ title: "Sales orders" })),
      "first",
    );
    expectOk(await MapResources(ordersInput({ title: "  " })), "remap");
    expect((await ordersPage()).displayName).to.equal("Sales orders");
    expect(await pageSource()).to.match(/caption: "Sales orders"/);
  });

  it("falls back to the humanized relation name when the title is blank", async () => {
    expectOk(await MapResources(ordersInput({ title: "  " })), "MapResources");
    expect(await pageSource()).to.match(/caption: "Orders"/);
    expect((await ordersPage()).displayName).to.equal("Orders");
  });

  it("is kept when the page's table options are written", async () => {
    expectOk(
      await MapResources(
        ordersInput({
          tableOptions: { cards: { fields: ["reference"] } },
        }),
      ),
      "MapResources",
    );
    expect(await pageSource()).to.match(/caption: "Orders"/);
  });
});
