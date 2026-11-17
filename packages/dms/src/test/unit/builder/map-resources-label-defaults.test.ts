import { expect } from "chai";
import { MapResources } from "../../../implementations/dms-builder";
import { expectOk } from "./harness";
import {
  closeShop,
  customers,
  inputOf,
  labelsOfOrders,
  LEFT_OUT,
  openShop,
  orders,
} from "./helpers/label-defaults-shop";
import { OP_TIMEOUT } from "./mapped-database";

describe("mapping with the label of a relation column left out", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(openShop);

  afterEach(closeShop);

  it("titles a new relation column by its target in singular, and keeps the other columns humanized", async () => {
    expectOk(
      await MapResources(inputOf(customers(), orders(LEFT_OUT))),
      "MapResources",
    );
    expect(await labelsOfOrders()).to.include({
      customer_id: "Customer",
      reference: "Reference",
      status: "Status",
    });
  });

  it("titles the column by the title the batch gives its target", async () => {
    expectOk(
      await MapResources(
        inputOf(customers({ title: "Accounts" }), orders(LEFT_OUT)),
      ),
      "MapResources",
    );
    expect((await labelsOfOrders()).customer_id).to.equal("Account");
  });

  it("titles the column by the page title of a target mapped by an earlier call", async () => {
    expectOk(
      await MapResources(inputOf(customers({ title: "Clients" }))),
      "target alone",
    );
    expectOk(await MapResources(inputOf(orders(LEFT_OUT))), "orders alone");
    expect((await labelsOfOrders()).customer_id).to.equal("Client");
  });
});
