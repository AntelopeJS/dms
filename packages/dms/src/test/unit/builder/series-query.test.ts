import { expect } from "chai";
import {
  AddQuery,
  CreateCategory,
  CreatePage,
  ConfigureQuery,
  CreateResource,
  GetPageStructure,
  ListQueryTemplates,
  RemoveQuery,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import type { AddQueryInput } from "@antelopejs/interface-dms-builder";

const PAGE = "/shop/dashboard";
const MODEL_FILE = "order/database.ts";
const PAGE_FILE = "dashboard/page.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** The parameters a monthly revenue chart is configured with. */
const MONTHLY_REVENUE = {
  name: "monthlyRevenue",
  resource: "order",
  template: "series",
  params: {
    op: "sum",
    field: "amount",
    groupBy: "createdAt",
    bucket: "month",
    timezone: "Europe/Brussels",
    where: [{ field: "status", op: "eq", value: "paid" }],
  },
};

function writesSeriesQueries(): void {
  it("is offered as a template, and announces the shape it answers with", async () => {
    const templates = await ListQueryTemplates("database-table");
    const series = templates.find((template) => template.id === "series");
    expect(series?.output).to.equal("series");
    expect(Object.keys(series?.params ?? {})).to.include.members([
      "op",
      "groupBy",
      "bucket",
      "limit",
    ]);
  });

  it("writes the monthly measure into the model", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await AddQuery(PAGE, MONTHLY_REVENUE), "AddQuery");

    const model = app.read(MODEL_FILE);
    expect(model).to.contain('.filter((row) => row.key("status").eq("paid"))');
    expect(model).to.contain(
      '.map((row) => ({\n        bucket: row.key("createdAt").year("Europe/Brussels")',
    );
    expect(model).to.contain('.group("bucket", (rows, group) =>');
    expect(model, "a timeline is ordered").to.contain('.orderBy("x", "asc")');
  });

  it("answers points rather than a number", async () => {
    const page = app.read(PAGE_FILE);
    expect(page).to.contain(
      "): Promise<{ series: { x: number | string; y: number | null }[] }> {",
    );
    expect(page).to.contain(
      "return { series: await model.monthlyRevenue().run() };",
    );
  });

  it("writes a top N as an ordering and a limit", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "topStatuses",
        resource: "order",
        template: "series",
        params: {
          op: "sum",
          field: "amount",
          groupBy: "status",
          orderBy: "measure",
          direction: "desc",
          limit: 5,
        },
      }),
      "AddQuery",
    );

    const model = app.read(MODEL_FILE);
    expect(model).to.contain('.group("status", (rows, group) =>');
    expect(model).to.contain('.orderBy("y", "desc")\n      .slice(0, 5);');
    expect(model, "grouping on a field needs no projection").to.not.contain(
      '.map((row) => ({ bucket: row.key("status")',
    );
  });
}

function readsBackAndEditsSeriesQueries(): void {
  it("reads back as the parameters that produced it", async () => {
    const structure = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    const series = structure.queries.find(
      (query) => query.name === "monthlyRevenue",
    );

    expect(series?.opaque, "the builder recognizes its own chain").to.not.equal(
      true,
    );
    expect(series?.template).to.equal("series");
    expect(series?.output).to.equal("series");
    expect(series?.params).to.deep.equal({
      ...MONTHLY_REVENUE.params,
      orderBy: "group",
      direction: "asc",
    });
  });

  it("reads a ranking back as an ordering and a limit", async () => {
    const structure = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    const top = structure.queries.find((query) => query.name === "topStatuses");
    expect(top?.params).to.deep.equal({
      op: "sum",
      field: "amount",
      groupBy: "status",
      orderBy: "measure",
      direction: "desc",
      limit: 5,
    });
  });

  it("is edited in place, like any readable query", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@monthlyRevenue`, {
        params: { ...MONTHLY_REVENUE.params, bucket: "quarter" },
      }),
      "ConfigureQuery",
    );

    expect(app.read(MODEL_FILE), "the period is recompiled").to.contain(
      ".sub(1).div(3).floor().add(1)",
    );
    const structure = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    const series = structure.queries.find(
      (query) => query.name === "monthlyRevenue",
    );
    expect(series?.params).to.include({ bucket: "quarter" });
  });

  it("is removed entirely, route and calculation", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveQuery(`${PAGE}@topStatuses`), "RemoveQuery");

    expect(app.read(PAGE_FILE)).to.not.contain("topStatuses");
    expect(app.read(MODEL_FILE)).to.not.contain("topStatuses");
  });
}

function refusesUncomputableSeries(): void {
  describe("refuses what the database could not compute", () => {
    async function rejected(
      name: string,
      params: NonNullable<AddQueryInput["params"]>,
    ): Promise<string[]> {
      const result = await AddQuery(PAGE, {
        name,
        resource: "order",
        template: "series",
        params,
      });
      expect(result.ok, `${name} should be refused`).to.equal(false);
      if (result.ok || result.error.code !== "invalid_config") {
        throw new Error(
          `expected invalid_config, got ${JSON.stringify(result)}`,
        );
      }
      return (result.error.issues ?? []).map((issue) => issue.pointer);
    }

    it("a period bucket on a field that is not a date", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badBucket", { groupBy: "status", bucket: "month" }),
      ).to.include("/bucket");
    });

    it("a measure over a field that is not numeric", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badMeasure", {
          op: "sum",
          field: "status",
          groupBy: "status",
        }),
      ).to.include("/field");
    });

    it("a date field grouped by its exact value rather than a period", async function () {
      this.timeout(OP_TIMEOUT);
      expect(await rejected("rawDate", { groupBy: "createdAt" })).to.include(
        "/groupBy",
      );
    });

    it("a grouping field the resource does not have", async function () {
      this.timeout(OP_TIMEOUT);
      expect(await rejected("badGroup", { groupBy: "nope" })).to.include(
        "/groupBy",
      );
    });

    it("a limit that is not a whole number in range", async function () {
      this.timeout(OP_TIMEOUT);
      expect(
        await rejected("badLimit", { groupBy: "status", limit: 0 }),
      ).to.include("/limit");
      expect(
        await rejected("badLimit2", { groupBy: "status", limit: 2.5 }),
      ).to.include("/limit");
    });

    it("an expression smuggled in as a filter value", async function () {
      this.timeout(OP_TIMEOUT);
      const pointers = await rejected("injected", {
        groupBy: "status",
        where: [
          { field: "amount", op: "gt", value: { $expr: "process.env.SECRET" } },
        ],
      });
      expect(pointers.length).to.be.greaterThan(0);
      expect(app.read(MODEL_FILE)).to.not.contain("process.env");
    });
  });
}

/**
 * The reference journey's calculation, written into a real project: a chart's
 * worth of data — a measure per month, filtered — generated from parameters
 * rather than from a route someone had to write.
 */
describe("a series query", () => {
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
          {
            name: "createdAt",
            label: "Created",
            dataType: { $dataType: "date" },
          },
        ],
      }),
      "CreateResource",
    );
    expectOk(
      await CreatePage({
        name: "dashboard",
        displayName: "Dashboard",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  writesSeriesQueries();
  readsBackAndEditsSeriesQueries();
  refusesUncomputableSeries();
});
