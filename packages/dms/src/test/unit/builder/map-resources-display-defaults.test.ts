import { expect } from "chai";
import type { ColumnDisplay } from "@antelopejs/interface-dms-builder";
import { MapResources } from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  bareInput,
  closeShop,
  moduleFile,
  openShop,
} from "./helpers/display-defaults-shop";
import {
  ITEMS_FROM_STATUS,
  ordersInput,
  pageText,
  TABS_FROM_STATUS,
} from "./helpers/shop-orders";
import { OP_TIMEOUT } from "./mapped-database";

const SETTLED: ColumnDisplay = {
  kind: "badge",
  items: [
    { value: "paid", label: "Settled", tone: "info" },
    { value: "pending", label: "Waiting", tone: "neutral" },
  ],
};

describe("mapping with the display and the tabs left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(openShop);

  afterEach(closeShop);

  it("takes the badge, the price and the tabs the profile proposes for a relation not mapped before", async () => {
    expectOk(await MapResources(bareInput()), "MapResources");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.match(ITEMS_FROM_STATUS);
    expect(orders).to.not.include("cancelled");
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(await pageText()).to.match(TABS_FROM_STATUS);
  });

  it("keeps the display a relation mapped before has when a remap leaves it out", async () => {
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference", display: SETTLED },
            { column: "status", filterable: true, display: null },
            { column: "total", display: { kind: "price" } },
          ],
          tabs: null,
        }),
      ),
      "first mapping",
    );
    expectOk(await MapResources(bareInput()), "remap without display");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.match(/itemsFrom:\s*\{\s*column:\s*"reference"\s*\}/);
    expect(orders).to.not.match(ITEMS_FROM_STATUS);
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
  });

  it("does not give a relation mapped before the display the profile proposes for a column that had none", async () => {
    expectOk(
      await MapResources(bareInput({}, { display: null })),
      "first mapping with a plain total",
    );
    expectOk(await MapResources(bareInput()), "remap without display");
    expect(moduleFile("shop/orders/data-api.ts")).to.not.include("PriceType");
  });
});
