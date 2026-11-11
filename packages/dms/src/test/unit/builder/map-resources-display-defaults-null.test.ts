import { expect } from "chai";
import { MapResources } from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  analysed,
  bareInput,
  closeShop,
  moduleFile,
  openShop,
  profiles,
} from "./helpers/display-defaults-shop";
import { handEditedTabs, ordersInput, pageText } from "./helpers/shop-orders";
import { OP_TIMEOUT } from "./mapped-database";

describe("mapping with the display and the tabs left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(openShop);

  afterEach(closeShop);

  it("writes the column plain for a display of null, and no tabs over a plain column", async () => {
    expectOk(
      await MapResources(
        bareInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total", display: null },
          ],
        }),
      ),
      "MapResources",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
    expect(await pageText()).to.not.include("tabs");
  });

  it("writes the plain column over a display the relation had when the display is null", async () => {
    expectOk(await MapResources(ordersInput()), "first mapping");
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: null },
            { column: "total", display: null },
          ],
          tabs: undefined,
        }),
      ),
      "remap with null displays",
    );
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.not.include("SelectType");
    expect(orders).to.not.include("PriceType");
  });

  it("writes no tabs for tabs of null on a new relation, and removes the tabs the mapping wrote on a mapped one", async () => {
    expectOk(await MapResources(bareInput({ tabs: null })), "new, tabs null");
    expect(await pageText()).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include("SelectType");
    expectOk(await MapResources(ordersInput()), "tabs written");
    expect(await pageText()).to.include("status-paid");
    expectOk(
      await MapResources(bareInput({ tabs: null })),
      "remap with tabs null",
    );
    expect(await pageText()).to.not.include("status-paid");
    expect(moduleFile("shop/orders/data-api.ts")).to.include("SelectType");
  });

  it("keeps the tabs a person edited when tabs is null", async () => {
    await handEditedTabs();
    expectOk(
      await MapResources(bareInput({ tabs: null })),
      "remap with tabs null",
    );
    expect(await pageText()).to.include('label: "Everything"');
  });

  it("proposes the price by the column's name and says no badge was proposed when no profile can be read", async () => {
    profiles.down = true;
    const mapped = await MapResources(bareInput());
    expectOk(mapped, "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(orders).to.not.include("SelectType");
    expect(JSON.stringify(mapped.ok && mapped.warnings)).to.include(
      "shop.orders",
    );
  });

  it("takes the badge from the last analysis of the connection when the profile cannot be read at map time", async () => {
    await analysed();
    profiles.down = true;
    expectOk(await MapResources(bareInput()), "MapResources");
    expect(moduleFile("shop/orders/data-api.ts")).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
  });
});
