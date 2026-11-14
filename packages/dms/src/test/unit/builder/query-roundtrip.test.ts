import { expect } from "chai";
import {
  AddQuery,
  ConfigureQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  RemoveQuery,
} from "../../../implementations/dms-builder";
import type { QueryStructure } from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/orders";
const MODEL_FILE = "order/database.ts";
const PAGE_FILE = "orders/page.ts";

/** Every operation typechecks the whole fixture through ts-morph. */
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function queries(): Promise<QueryStructure[]> {
  const structure = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return structure.queries;
}

async function queryNamed(name: string): Promise<QueryStructure> {
  const found = (await queries()).find((query) => query.name === name);
  if (!found) {
    throw new Error(`no query named ${name} on ${PAGE}`);
  }
  return found;
}

function writesAQuery(): void {
  it("emits a model method and a route, and answers with both addresses", async function () {
    this.timeout(OP_TIMEOUT);
    const added = expectOk(
      await AddQuery(PAGE, {
        name: "paidRevenue",
        resource: "order",
        template: "aggregate",
        params: {
          op: "sum",
          field: "amount",
          where: [{ field: "status", op: "eq", value: "paid" }],
        },
      }),
      "AddQuery",
    );

    expect(added.query).to.equal(`${PAGE}@paidRevenue`);
    expect(added.route).to.equal(`/dms/pages${PAGE}/stats/paid-revenue`);
    expect(app.read(MODEL_FILE)).to.contain(
      'return this.table\n      .filter((row) => row.key("status").eq("paid"))' +
        '\n      .sum("amount");',
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain('@Get("/stats/paid-revenue")');
    expect(page).to.contain(
      "return { value: await model.paidRevenue().run() };",
    );
  });

  it("guards the route with the page's own permission", async () => {
    const page = app.read(PAGE_FILE);

    expect(page).to.contain("@AuthUserWithPermission(OrdersPage) _user: User,");
    expect(page).to.contain(
      'import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";',
    );
  });

  it("counts rows with no filter at all", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "orderCount",
        resource: "order",
        template: "count",
      }),
      "AddQuery",
    );
    expect(app.read(MODEL_FILE)).to.contain("return this.table.count();");
  });

  it("binds a filter value to a route parameter instead of baking it in", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "cheaperThan",
        resource: "order",
        template: "count",
        params: {
          where: [
            {
              field: "amount",
              op: "lt",
              value: { $param: { name: "maxAmount" } },
            },
          ],
        },
      }),
      "AddQuery",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain('@Parameter("maxAmount", "query")');
    expect(page, "the route coerces before calling the model").to.contain(
      "Number(maxAmount)",
    );
  });

  it("gives a second query its own model method, even for an identical chain", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "totalOrders",
        resource: "order",
        template: "count",
      }),
      "AddQuery",
    );

    const model = app.read(MODEL_FILE);
    const occurrences = model.split("return this.table.count();").length - 1;
    expect(
      occurrences,
      "each query carries its own copy of the chain",
    ).to.equal(2);
  });

  it("refuses a raw expression in a query's parameters", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await AddQuery(PAGE, {
      name: "injected",
      resource: "order",
      template: "count",
      params: {
        where: [
          {
            field: "amount",
            op: "gt",
            value: { $expr: "process.env.SECRET" },
          },
        ],
      },
    });

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("invalid_config");
    }
    expect(app.read(MODEL_FILE)).to.not.contain("process.env");
  });
}

function readsAWrittenQueryBack(): void {
  it("reports the parameters that produced it", async () => {
    const query = await queryNamed("paidRevenue");
    expect(
      query.opaque,
      "a query the builder wrote is never opaque",
    ).to.not.equal(true);
    expect(query.template).to.equal("aggregate");
    expect(query.resource).to.equal("order");
    expect(query.output).to.equal("scalar");
    expect(query.endpoint).to.equal("/stats/paid-revenue");
    expect(query.params).to.deep.equal({
      op: "sum",
      field: "amount",
      where: [{ field: "status", op: "eq", value: "paid" }],
    });
  });

  it("reports an empty parameter set for an unfiltered count", async () => {
    const query = await queryNamed("orderCount");
    expect(query.template).to.equal("count");
    expect(query.params).to.deep.equal({});
    expect(query.modelMethod).to.equal("orderCount");
  });

  it("resolves a bound value against the route that supplies it", async () => {
    const query = await queryNamed("cheaperThan");
    expect(query.routeParams).to.deep.equal([
      { name: "maxAmount", in: "query" },
    ]);
    expect(query.params).to.deep.equal({
      where: [
        {
          field: "amount",
          op: "lt",
          value: { $param: { name: "maxAmount", in: "query" } },
        },
      ],
    });
  });

  it("recompiles a query in place when its parameters change", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@paidRevenue`, {
        params: {
          op: "avg",
          field: "amount",
          where: [{ field: "status", op: "eq", value: "paid" }],
        },
      }),
      "ConfigureQuery",
    );

    expect(app.read(MODEL_FILE)).to.contain('.avg("amount");');
    expect((await queryNamed("paidRevenue")).params).to.include({
      op: "avg",
      field: "amount",
    });
  });

  it("drops the route and the method it called when a query is removed", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveQuery(`${PAGE}@cheaperThan`), "RemoveQuery");

    expect(app.read(PAGE_FILE)).to.not.contain("cheaperThan");
    expect(app.read(MODEL_FILE)).to.not.contain("cheaperThan");
    expect((await queries()).map((query) => query.name)).to.not.include(
      "cheaperThan",
    );
  });
}

/**
 * What the engine guarantees today about the queries it writes, pinned before the
 * calculation model is refactored: emission and read-back are inverse, and a
 * query a human can still recognize in the file is one the builder can still edit.
 */
describe("the query engine", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
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
          {
            name: "status",
            label: "Status",
            dataType: { $dataType: "string" },
          },
        ],
      }),
      "CreateResource",
    );
    expectOk(
      await CreatePage({
        name: "orders",
        displayName: "Orders",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  describe("writing a query", () => {
    writesAQuery();
  });

  describe("reading a written query back", () => {
    readsAWrittenQueryBack();
  });
});
