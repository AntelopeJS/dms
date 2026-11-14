import { expect } from "chai";
import {
  AddQuery,
  ConfigureQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
} from "../../../implementations/dms-builder";
import type { AddQueryInput } from "@antelopejs/interface-dms-builder";
import {
  queryRouteMethodText,
  type CompiledQuery,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** A monthly measure, which every arrangement below is built from. */
const MONTHLY: AddQueryInput = {
  name: "revenue",
  resource: "order",
  template: "series",
  params: {
    op: "sum",
    field: "amount",
    groupBy: "createdAt",
    bucket: "month",
  },
};

/** The same, with the bounds the page's period selector supplies. */
const PERIOD_BOUNDS = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

async function queryNamed(name: string) {
  const structure = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return structure.queries.find((query) => query.name === name);
}

function arrangesOneCalculationPerBlock(): void {
  it("answers the points themselves by default", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await AddQuery(PAGE, MONTHLY), "AddQuery");
    expect(app.read(PAGE_FILE)).to.contain(
      "return { series: await model.revenue().run() };",
    );
  });

  for (const response of ["constructor", "toString", "hasOwnProperty"]) {
    it(`writes a route for a response named ${response} as the default series`, () => {
      const spec: CompiledQuery = {
        name: "revenue",
        endpoint: "/revenue",
        template: "series",
        params: {},
        chain: { body: "{ return []; }", parameters: [] },
        naming: { measure: "sum", label: "Amount" },
        response,
      };
      const route = queryRouteMethodText(
        spec,
        "Order",
        "main",
        "revenue",
        "BoardPage",
      );

      expect(route.text).to.contain(
        "return { series: await model.revenue().run() };",
      );
      expect(
        route.symbols.map((symbol) => symbol.name),
        "no helper is imported for it",
      ).to.not.include(response);
    });
  }

  it("builds a card's headline figure from the same points", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "revenueCard",
        response: "card",
      }),
      "AddQuery",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain(
      'chartCardData(await model.revenueCard().run(), { measure: "sum", label: "Amount"',
    );
    expect(page, "the helper is imported, not reinvented").to.contain(
      'import { ChartCardData, chartCardData } from "@antelopejs/interface-dms/base";',
    );
    expect(page).to.contain("): Promise<ChartCardData> {");
  });

  it("states the measure a card counts with, which the caller never asked for", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "ordersCard",
        params: { groupBy: "createdAt", bucket: "month" },
        response: "card",
      }),
      "AddQuery",
    );
    expect(app.read(PAGE_FILE)).to.contain(
      'chartCardData(await model.ordersCard().run(), { measure: "count", label: "order"',
    );
  });

  it("builds a ranked list from the same points", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "topMonths",
        response: "items",
      }),
      "AddQuery",
    );
    expect(app.read(PAGE_FILE)).to.contain(
      "topListData(await model.topMonths().run()",
    );
  });

  it("reads the arrangement back, so a card stays editable", async function () {
    this.timeout(OP_TIMEOUT);
    const card = await queryNamed("revenueCard");
    expect(card?.opaque, "an arrangement is not an opaque body").to.not.equal(
      true,
    );
    expect(card?.template).to.equal("series");
    expect(
      card?.response,
      "the arrangement reads back beside the parameters",
    ).to.equal("card");
    expect(card?.params).to.include({ op: "sum" });
  });
}

/**
 * A route reads a query-string parameter as interface-api's `QueryValue` and
 * narrows it to text before the model sees it, so the page it writes
 * typechecks on interface-api 0.3.1 and later.
 */
function readsParametersAsTheQueryStringGivesThem(): void {
  it("reads a text query parameter as text and keeps a path parameter a string", () => {
    const spec: CompiledQuery = {
      name: "byStatus",
      endpoint: "/orders/:region",
      template: "count",
      params: {},
      chain: {
        body: "{ return 0; }",
        parameters: [
          { name: "status", routeName: "status", type: "string", in: "query" },
          { name: "region", routeName: "region", type: "string", in: "param" },
        ],
      },
      naming: { measure: "count", label: "Order" },
    };
    const route = queryRouteMethodText(
      spec,
      "Order",
      "main",
      "byStatus",
      "BoardPage",
    );

    expect(route.text).to.contain(
      '@Parameter("status", "query") status: string | true | undefined,',
    );
    expect(route.text).to.contain(
      '@Parameter("region", "param") region: string,',
    );
    expect(route.text).to.contain("model.byStatus(String(status), region)");
  });

  it("writes a period-bound query whose route typechecks on the installed interface-api", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "revenueInPeriod",
        params: { ...MONTHLY.params, where: PERIOD_BOUNDS },
      }),
      "AddQuery",
    );
    expect(app.read(PAGE_FILE)).to.contain(
      "model.revenueInPeriod(new Date(String(from)), new Date(String(to)))",
    );
    const query = await queryNamed("revenueInPeriod");
    expect(
      query?.template,
      "the narrowed bounds read back as the period's parameters",
    ).to.equal("series");
    expect(query?.opaque).to.not.equal(true);
  });
}

function comparesAgainstThePeriodBefore(): void {
  it("asks the same calculation twice, with the bounds the route received", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "revenueTrend",
        params: { ...MONTHLY.params, where: PERIOD_BOUNDS },
        response: "card",
        compare: true,
      }),
      "AddQuery",
    );

    const page = app.read(PAGE_FILE);
    expect(page, "the preceding period is a parameter, not a guess").to.contain(
      '@Parameter("compareFrom", "query") compareFrom: string | true | undefined,',
    );
    expect(page).to.contain(
      '@Parameter("compareTo", "query") compareTo: string | true | undefined,',
    );
    expect(
      page,
      "the period's own bounds admit what a query string gives",
    ).to.contain(
      '@Parameter("from", "query") from: string | true | undefined,',
    );
    expect(page).to.contain(
      "previous: await model.revenueTrend(new Date(String(compareFrom)), new Date(String(compareTo))).run()",
    );
  });

  it("reads the comparison back, so the next save keeps it", async function () {
    this.timeout(OP_TIMEOUT);
    const trend = await queryNamed("revenueTrend");
    expect(trend?.opaque).to.not.equal(true);
    expect(trend?.compare).to.equal(true);
    expect(
      (await queryNamed("revenueCard"))?.compare,
      "a card that does not compare says nothing of it",
    ).to.equal(undefined);
  });

  it("keeps the arrangement and the comparison when only the parameters change", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@revenueTrend`, {
        params: { ...MONTHLY.params, where: PERIOD_BOUNDS, limit: 12 },
      }),
      "ConfigureQuery",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain(
      "chartCardData(await model.revenueTrend(new Date(String(from)), new Date(String(to))).run()",
    );
    expect(page).to.contain(
      "previous: await model.revenueTrend(new Date(String(compareFrom)), new Date(String(compareTo))).run()",
    );
    const trend = await queryNamed("revenueTrend");
    expect(trend?.params).to.include({ limit: 12 });
    expect(trend?.response).to.equal("card");
    expect(trend?.compare).to.equal(true);
  });

  it("rearranges a query and drops its comparison when asked to", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@revenueTrend`, {
        response: "items",
        compare: false,
      }),
      "ConfigureQuery",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain("topListData(await model.revenueTrend(");
    expect(page).to.not.contain("previous: await model.revenueTrend");
    const trend = await queryNamed("revenueTrend");
    expect(trend?.response).to.equal("items");
    expect(trend?.compare).to.equal(undefined);
  });

  it("declines to compare a calculation whose dates are baked in", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        ...MONTHLY,
        name: "revenueFixed",
        response: "card",
        compare: true,
      }),
      "AddQuery",
    );
    expect(app.read(PAGE_FILE)).to.not.contain(
      "previous: await model.revenueFixed",
    );
  });
}

/**
 * One calculation, arranged for whichever block reads it.
 *
 * A chart wants the points, a card wants a figure above them, a ranked list
 * wants entries — and the route stays one expression in every case, which is what
 * keeps it readable back into the parameters that produced it.
 */
describe("how a query's answer is arranged", () => {
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
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  arrangesOneCalculationPerBlock();

  describe("reading parameters as the query string gives them", () => {
    readsParametersAsTheQueryStringGivesThem();
  });

  describe("comparing against the period before", () => {
    comparesAgainstThePeriodBefore();
  });
});
