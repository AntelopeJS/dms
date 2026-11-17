import { expect } from "chai";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { MapResources } from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  closeShop,
  customers,
  describeShopAs,
  inputOf,
  labelsOfOrders,
  LEFT_OUT,
  openShop,
  orders,
} from "./helpers/label-defaults-shop";
import { SHOP } from "./helpers/shop-orders";
import { OP_TIMEOUT } from "./mapped-database";

const COMMENTED_SHOP: RelationDescription[] = SHOP.map((relation) => ({
  ...relation,
  columns: relation.columns.map((column) =>
    column.name === "customer_id"
      ? { ...column, comment: "Who placed it. Set at checkout." }
      : column,
  ),
}));

describe("mapping with the label of a relation column left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(openShop);

  afterEach(closeShop);

  it("writes the label as sent", async () => {
    expectOk(
      await MapResources(
        inputOf(
          customers(),
          orders([
            {
              column: "customer_id",
              relation: "shop.customers",
              label: "Buyer",
            },
          ]),
        ),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Buyer");
  });

  it("keeps the label a relation mapped before has when a remap leaves it out", async () => {
    expectOk(
      await MapResources(
        inputOf(
          customers(),
          orders([
            {
              column: "customer_id",
              relation: "shop.customers",
              label: "Buyer",
            },
          ]),
        ),
      ),
      "first mapping",
    );
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "remap without label",
    );
    expect(await labelsOfOrders()).to.include({
      customer_id: "Buyer",
      reference: "Reference",
    });
  });

  it("titles a relation column the relation mapped before did not have by its target", async () => {
    expectOk(
      await MapResources(
        inputOf(customers(), orders([{ column: "reference" }])),
      ),
      "first mapping",
    );
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "remap with a relation column",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Customer");
  });

  it("keeps the database comment's title over the target's for a column it commented", async () => {
    describeShopAs(COMMENTED_SHOP);
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Who placed it");
  });

  it("keeps the humanized column name for a column that points nowhere", async () => {
    expectOk(
      await MapResources(
        inputOf(orders([{ column: "customer_id" }, { column: "reference" }])),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Customer id");
  });
});
