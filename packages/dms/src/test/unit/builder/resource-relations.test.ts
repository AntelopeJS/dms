import { expect } from "chai";
import {
  AddField,
  CreateResource,
  DeleteResource,
} from "../../../implementations/dms-builder";
import type { DataTypeValue } from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const INVOICE_TABLE = "invoice/database.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

function relationTo(resource: string): DataTypeValue {
  return {
    $dataType: "relation",
    config: { dataApiController: { $ref: { resource } } },
  };
}

/**
 * A relation column holds the id of a row in another table. The DMS joins and
 * filters on it, so it is indexed unless asked otherwise, and the table it
 * points at cannot be deleted from under it.
 */
describe("resources related to one another", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateResource({
        name: "customer",
        displayName: "Customer",
        fields: [
          { name: "name", label: "Name", dataType: { $dataType: "string" } },
        ],
      }),
      "CreateResource customer",
    );
    expectOk(
      await CreateResource({
        name: "invoice",
        displayName: "Invoice",
        fields: [
          {
            name: "customer",
            label: "Customer",
            dataType: relationTo("customer"),
          },
          { name: "total", label: "Total", dataType: { $dataType: "number" } },
        ],
      }),
      "CreateResource invoice",
    );
  });

  after(() => destroyFixture());

  it("indexes a relation column it creates, and nothing else", () => {
    const table = app.read(INVOICE_TABLE);
    expect(table).to.contain(
      '@Index() @Field("string") declare customer: string;',
    );
    expect(table).to.contain('@Field("number") declare total: number;');
    expect(table).to.not.contain('@Index() @Field("number")');
  });

  it("indexes a relation column it adds, unless told not to", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddField("invoice", {
        name: "payer",
        label: "Payer",
        dataType: relationTo("customer"),
      }),
      "AddField payer",
    );
    expectOk(
      await AddField("invoice", {
        name: "referrer",
        label: "Referrer",
        dataType: relationTo("customer"),
        indexed: false,
      }),
      "AddField referrer",
    );

    const table = app.read(INVOICE_TABLE);
    expect(table).to.contain(
      '@Index() @Field("string") declare payer: string;',
    );
    expect(table).to.contain('@Field("string") declare referrer: string;');
    expect(table).to.not.contain('@Index() @Field("string") declare referrer');
  });

  it("refuses to delete a resource another one relates to", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await DeleteResource("customer");

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error).to.deep.equal({
        code: "referential_integrity",
        blockedBy: ["invoice"],
      });
    }
    expect(app.exists("customer/data-api.ts"), "nothing was deleted").to.equal(
      true,
    );
    expect(app.read(INVOICE_TABLE)).to.contain("declare customer");
  });

  it("deletes it once what relates to it is gone", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await DeleteResource("invoice"), "DeleteResource invoice");
    expectOk(await DeleteResource("customer"), "DeleteResource customer");

    expect(app.exists("customer/data-api.ts")).to.equal(false);
  });
});
