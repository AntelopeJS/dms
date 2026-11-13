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
import { ordersInput, pageText } from "./helpers/shop-orders";
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
    expect(orders).to.include("new DefaultDataTypes.SelectType({");
    expect(orders).to.include(
      '{ label: "Cancelled", value: "cancelled", textColor: "error" }',
    );
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect((await pageText()).replace(/\s+/g, " ")).to.include(
      'id: "status-paid"',
    );
  });

  it("keeps the display a relation mapped before has when a remap leaves it out", async () => {
    expectOk(
      await MapResources(
        ordersInput({
          fields: [
            { column: "reference" },
            { column: "status", filterable: true, display: SETTLED },
            { column: "total", display: { kind: "price" } },
          ],
          tabs: { column: "status" },
        }),
      ),
      "first mapping",
    );
    expectOk(await MapResources(bareInput()), "remap without display");
    const orders = moduleFile("shop/orders/data-api.ts");
    expect(orders).to.include('{ label: "Settled", value: "paid"');
    expect(orders).to.not.include("Cancelled");
    expect(orders).to.include("new DefaultDataTypes.PriceType()");
    expect(await pageText()).to.include('label: "Settled"');
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
