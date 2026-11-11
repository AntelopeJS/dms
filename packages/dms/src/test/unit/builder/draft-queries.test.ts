import { expect } from "chai";
import {
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import type {
  AddQueryInput,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const MODEL_FILE = "order/database.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

const REVENUE: AddQueryInput = {
  name: "revenue",
  resource: "order",
  template: "aggregate",
  params: { op: "sum", field: "amount" },
};

const ORDER_COUNT: AddQueryInput = {
  name: "orderCount",
  resource: "order",
  template: "count",
};

const KPI = {
  name: "revenueKpi",
  type: "KpiCard",
  config: { title: "Revenue", fetchUrl: `/dms/pages${PAGE}/stats/revenue` },
};

async function structure(): Promise<PageStructure> {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure");
}

async function queryNames(): Promise<string[]> {
  return (await structure()).queries.map((query) => query.name).sort();
}

/**
 * A block and the data it reads are one edit, so they are one write. These cover
 * what that means in practice: the draft carries both, an absent `queries` is not
 * an empty one, and a query a human has taken over survives either way.
 */
describe("queries in a page draft", () => {
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

  it("writes the blocks and the queries in one save", async function () {
    this.timeout(OP_TIMEOUT);
    const saved = expectOk(
      await SetPageBlocks(PAGE, { blocks: [KPI], queries: [REVENUE] }),
      "SetPageBlocks",
    );
    expect(saved.version).to.be.a("string");

    const page = app.read(PAGE_FILE);
    expect(page, "the block is there").to.contain(
      "static revenueKpi = KpiCard({",
    );
    expect(page, "and so is its route").to.contain('@Get("/stats/revenue")');
    expect(app.read(MODEL_FILE)).to.contain('return this.table.sum("amount");');
    expect(await queryNames()).to.deep.equal(["revenue"]);
  });

  it("adds a query the next draft carries", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [KPI],
        queries: [REVENUE, ORDER_COUNT],
      }),
      "SetPageBlocks",
    );
    expect(await queryNames()).to.deep.equal(["orderCount", "revenue"]);
  });

  it("recompiles a query whose parameters changed", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [KPI],
        queries: [
          { ...REVENUE, params: { op: "avg", field: "amount" } },
          ORDER_COUNT,
        ],
      }),
      "SetPageBlocks",
    );
    expect(app.read(MODEL_FILE)).to.contain('.avg("amount");');
    expect(app.read(MODEL_FILE)).to.not.contain(
      'return this.table.sum("amount");',
    );
  });

  it("drops a query the draft no longer carries, with its calculation", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [KPI],
        queries: [{ ...REVENUE, params: { op: "avg", field: "amount" } }],
      }),
      "SetPageBlocks",
    );

    expect(await queryNames()).to.deep.equal(["revenue"]);
    expect(app.read(PAGE_FILE)).to.not.contain("orderCount");
    expect(app.read(MODEL_FILE), "and the method it called").to.not.contain(
      "orderCount",
    );
  });

  it("leaves the queries alone when the draft says nothing about them", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await SetPageBlocks(PAGE, { blocks: [KPI] }), "SetPageBlocks");
    expect(await queryNames()).to.deep.equal(["revenue"]);
  });

  it("keeps a dropped query a block on the page still reads", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await SetPageBlocks(PAGE, { blocks: [KPI], queries: [] });

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.warnings?.map((warning) => warning.code)).to.include(
        "query_kept",
      );
    }
    expect(await queryNames()).to.deep.equal(["revenue"]);
  });

  it("removes every generated query once no block reads one", async function () {
    this.timeout(OP_TIMEOUT);
    const unplugged = { ...KPI, config: { title: "Revenue" } };
    expectOk(
      await SetPageBlocks(PAGE, { blocks: [unplugged], queries: [] }),
      "SetPageBlocks",
    );
    expect(await queryNames()).to.deep.equal([]);
    expect(app.read(MODEL_FILE)).to.not.contain("revenue");
  });

  it("renames a query in one save, freeing the endpoint it had", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [KPI],
        queries: [{ ...REVENUE, name: "turnover", endpoint: "/stats/revenue" }],
      }),
      "SetPageBlocks",
    );

    expect(await queryNames()).to.deep.equal(["turnover"]);
    expect(app.read(PAGE_FILE)).to.contain('@Get("/stats/revenue")');
  });

  it("refuses a draft naming one query twice, before writing anything", async function () {
    this.timeout(OP_TIMEOUT);
    const before = app.read(PAGE_FILE);
    const result = await SetPageBlocks(PAGE, {
      blocks: [KPI],
      queries: [
        REVENUE,
        { ...REVENUE, params: { op: "avg", field: "amount" } },
      ],
    });

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("invalid_config");
    }
    expect(app.read(PAGE_FILE), "a refused save changes nothing").to.equal(
      before,
    );
  });

  it("rolls the blocks back when a query in the same draft is invalid", async function () {
    this.timeout(OP_TIMEOUT);
    const before = app.read(PAGE_FILE);
    const result = await SetPageBlocks(PAGE, {
      blocks: [
        KPI,
        { name: "second", type: "KpiCard", config: { title: "Two" } },
      ],
      queries: [{ ...REVENUE, params: { op: "sum", field: "nope" } }],
    });

    expect(result.ok).to.equal(false);
    expect(app.read(PAGE_FILE)).to.equal(before);
    expect(app.read(PAGE_FILE)).to.not.contain("second");
  });

  describe("a query edited by hand", () => {
    beforeEach(async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(
        await SetPageBlocks(PAGE, { blocks: [KPI], queries: [ORDER_COUNT] }),
        "SetPageBlocks",
      );
    });

    it("is adopted back when the edit stays in the grammar", async function () {
      this.timeout(OP_TIMEOUT);
      app.write(
        MODEL_FILE,
        app
          .read(MODEL_FILE)
          .replace(
            "return this.table.count();",
            'return this.table.filter((row) => row.key("amount").gt(0)).count();',
          ),
      );

      expectOk(
        await SetPageBlocks(PAGE, { blocks: [KPI], queries: [ORDER_COUNT] }),
        "SetPageBlocks",
      );
      expect(app.read(MODEL_FILE)).to.contain("return this.table.count();");
    });

    it("is neither rewritten nor removed once it leaves the grammar", async function () {
      this.timeout(OP_TIMEOUT);
      app.write(
        MODEL_FILE,
        app
          .read(MODEL_FILE)
          .replace(
            "return this.table.count();",
            "return this.table.slice(0, 10).count(); // mine now",
          ),
      );

      const result = await SetPageBlocks(PAGE, { blocks: [KPI], queries: [] });

      expect(result.ok).to.equal(true);
      if (result.ok) {
        expect(
          result.warnings?.map((warning) => warning.code),
          "the caller is told, rather than left to notice",
        ).to.include("query_opaque");
      }
      expect(
        app.read(MODEL_FILE),
        "the hand-written chain survives",
      ).to.contain("// mine now");
      expect(app.read(PAGE_FILE), "and so does its route").to.contain(
        "orderCount",
      );
    });
  });

  it("names a block's own data after the block, as the editor does", async function () {
    this.timeout(OP_TIMEOUT);
    const card = {
      name: "ordersCard",
      type: "KpiCard",
      config: {
        title: "Orders",
        fetchUrl: `/dms/pages${PAGE}/stats/orders-card`,
      },
    };
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [card],
        queries: [{ ...ORDER_COUNT, name: "ordersCard" }],
      }),
      "SetPageBlocks",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain("static ordersCard = KpiCard({");
    expect(page).to.contain('@Get("/stats/orders-card")');
    expect(page).to.contain("async ordersCard(");
  });
});
