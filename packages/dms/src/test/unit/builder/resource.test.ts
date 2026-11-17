import { expect } from "chai";
import {
  AddField,
  ConfigureField,
  CreateResource,
  GetResourceStructure,
  ListResources,
  RemoveField,
} from "../../../implementations/dms-builder";
import type { ResourceStructure } from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const MODEL_FILE = "order/database.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function order(): Promise<ResourceStructure> {
  return expectOk(await GetResourceStructure("order"), "GetResourceStructure");
}

async function fieldNamed(name: string) {
  const found = (await order()).fields.find((field) => field.name === name);
  if (!found) {
    throw new Error(`no field named ${name} on order`);
  }
  return found;
}

function emitsTheResourceAndAddsFields(): void {
  it("emits a table, a model and a data API, and lists the resource", async function () {
    this.timeout(OP_TIMEOUT);
    const structure = await order();
    expect(structure.className).to.equal("Order");
    expect(structure.tableName).to.equal("orders");
    expect(structure.route).to.equal("/api/order");

    expect(app.exists("order/database.ts")).to.equal(true);
    expect(app.exists("order/data-api.ts")).to.equal(true);
    expect(app.read(MODEL_FILE)).to.contain("export class Order extends Table");
    expect(app.read(MODEL_FILE)).to.contain("export class OrderModel extends");

    const listed = await ListResources();
    expect(listed.map((resource) => resource.ref)).to.include("order");
  });

  it("adds a field with the aspects a source will need", async function () {
    this.timeout(OP_TIMEOUT);
    const added = expectOk(
      await AddField("order", {
        name: "status",
        label: "Status",
        dataType: { $dataType: "string" },
        sortable: true,
        filterable: true,
      }),
      "AddField",
    );

    expect(added.path).to.equal("order#status");
    expect(app.read(MODEL_FILE)).to.contain(
      '@Field("string") declare status: string;',
    );

    const field = await fieldNamed("status");
    expect(field.sortable, "a source may order on it").to.equal(true);
    expect(field.filterable, "a source may filter on it").to.equal(true);
    expect(field.searchable).to.equal(false);
    expect(field.dataType).to.deep.equal({ $dataType: "string" });
  });

  it("adds a field the CSV export includes", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddField("order", {
        name: "reference",
        dataType: { $dataType: "string" },
        exported: true,
      }),
      "AddField",
    );

    expect((await fieldNamed("reference")).exported).to.equal(true);
  });

  it("adds a field mandatory on the routes it names", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddField("order", {
        name: "customer",
        dataType: { $dataType: "string" },
        mandatory: ["new"],
      }),
      "AddField",
    );

    expect((await fieldNamed("customer")).mandatory).to.deep.equal(["new"]);
  });

  it("adds the field an archive marks", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddField("order", {
        name: "archived",
        dataType: { $dataType: "boolean" },
        archiveField: true,
      }),
      "AddField",
    );

    expect((await fieldNamed("archived")).archiveField).to.equal(true);
  });

  it("leaves an archive field out of the column filters", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddField("order", {
        name: "closed",
        dataType: { $dataType: "boolean" },
        archiveField: true,
        filterable: true,
      }),
      "AddField",
    );
    expect((await fieldNamed("closed")).filterable).to.equal(false);

    expectOk(
      await ConfigureField("order#closed", { filterable: true }),
      "ConfigureField",
    );
    const closed = await fieldNamed("closed");
    expect(closed.archiveField).to.equal(true);
    expect(closed.filterable).to.equal(false);
  });
}

function createsChangesAndRemovesFields(): void {
  it("creates a resource whose field the CSV export includes", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await CreateResource({
        name: "invoice",
        fields: [
          { name: "title", dataType: { $dataType: "string" }, exported: true },
        ],
      }),
      "CreateResource",
    );

    const title = expectOk(
      await GetResourceStructure("invoice"),
      "GetResourceStructure",
    ).fields.find((field) => field.name === "title");
    expect(title?.exported).to.equal(true);
  });

  it("changes one aspect without rewriting the rest of the field", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureField("order#status", { searchable: true }),
      "ConfigureField",
    );

    const field = await fieldNamed("status");
    expect(field.searchable).to.equal(true);
    expect(field.sortable, "the aspects it already had are kept").to.equal(
      true,
    );
    expect(field.label).to.equal("Status");
  });

  it("refuses a field name the DataController already owns", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await AddField("order", {
      name: "_id",
      label: "Id",
      dataType: { $dataType: "string" },
    });

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("invalid_config");
    }
  });

  it("drops a field from the table when it is removed", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveField("order#status"), "RemoveField");

    expect(app.read(MODEL_FILE)).to.not.contain("declare status");
    expect((await order()).fields.map((field) => field.name)).to.not.include(
      "status",
    );
  });
}

/**
 * A resource is what a data source reads from, and its fields are what the
 * source editor offers as measures, groupings and filters — including the
 * aspects that decide whether a field may be sorted or filtered on at all.
 */
describe("resources and their fields", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateResource({
        name: "order",
        displayName: "Order",
        fields: [
          {
            name: "amount",
            label: "Amount",
            dataType: { $dataType: "number" },
          },
        ],
      }),
      "CreateResource",
    );
  });

  after(() => destroyFixture());

  emitsTheResourceAndAddsFields();
  createsChangesAndRemovesFields();
});
