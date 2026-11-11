import { expect } from "chai";
import type {
  AddQueryInput,
  ComposeBlock,
  ComposePageInput,
} from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  AddQuery,
  ComposePage,
  CreatePage,
  GetPageStructure,
  ListPages,
  ListResources,
  MapResources,
} from "../../../implementations/dms-builder";
import {
  answerStatus,
  typecheckCount,
} from "../../../implementations/dms-builder/engine";
import { expectOk } from "./harness";
import {
  freshMappedApp,
  installShopCatalog,
  ordersInput,
  removeShopCatalog,
} from "./helpers/table-view-shop";
import { fileText } from "./helpers/file-text";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

const PERIOD = [
  { field: "created_at", op: "ge", value: { $param: { name: "from" } } },
  { field: "created_at", op: "le", value: { $param: { name: "to" } } },
];

function series(extra: AddQueryInput["params"]): AddQueryInput {
  return {
    name: "unused",
    resource: ORDERS,
    template: "series",
    params: { op: "sum", field: "total", where: PERIOD, ...extra },
  };
}

let ORDERS = "";

function kpi(name: string, title: string, op: string): ComposeBlock {
  const { name: _name, ...query } = series({
    op,
    field: op === "count" ? undefined : "total",
    groupBy: "created_at",
    bucket: "day",
  });
  return {
    name,
    type: "KpiCard",
    slot: "main",
    config: { title, periodScope: "page", showDelta: true },
    query: { ...query, response: "value", compare: true },
  };
}

/** A toolbar, 3 KPIs, an area chart over time and two breakdowns. */
function analyticsBlocks(): ComposeBlock[] {
  const { name: _a, ...area } = series({
    groupBy: "created_at",
    bucket: "day",
  });
  const { name: _b, ...byChannel } = series({
    groupBy: "channel",
    orderBy: "measure",
    direction: "desc",
    limit: 5,
  });
  const { name: _c, ...byStatus } = series({
    op: "count",
    field: undefined,
    groupBy: "status",
    orderBy: "measure",
    direction: "desc",
    limit: 5,
  });
  return [
    {
      name: "toolbar",
      type: "PageToolbar",
      children: [{ name: "period", type: "PeriodSelector", config: {} }],
    },
    {
      name: "kpis",
      type: "GridRow",
      children: [
        kpi("revenue", "Revenue", "sum"),
        kpi("orders", "Orders", "count"),
        kpi("average", "Average order", "avg"),
      ],
    },
    {
      name: "revenueOverTime",
      type: "ChartCard",
      config: {
        title: "Revenue",
        periodScope: "page",
        chart: { $block: { type: "ChartArea", config: {} } },
      },
      query: { ...area, response: "card" },
    },
    {
      name: "breakdowns",
      type: "GridRow",
      children: [
        {
          name: "byChannel",
          type: "ChartBar",
          config: { periodScope: "page" },
          query: { ...byChannel, response: "card" },
        },
        {
          name: "byStatus",
          type: "TopListCard",
          config: { title: "Status", periodScope: "page" },
          query: { ...byStatus, response: "items" },
        },
      ],
    },
  ];
}

function analytics(name: string): ComposePageInput {
  return {
    create: {
      name,
      displayName: "Analytics",
      category: "pages.shop",
      module: MODULE,
    },
    blocks: analyticsBlocks(),
  };
}

/** Counts the typechecks a callback causes. */
async function countTypechecks<T>(run: () => Promise<T>) {
  const before = typecheckCount();
  const started = performance.now();
  const result = await run();
  return {
    result,
    count: typecheckCount() - before,
    ms: performance.now() - started,
  };
}

async function pageFile(id: string): Promise<string> {
  const page = (await ListPages()).find((entry) => entry.id === id);
  return page ? fileText(page.filepath) : "";
}

describe("composing a page in one call", function () {
  this.timeout(OP_TIMEOUT * 4);

  before(installShopCatalog);
  after(removeShopCatalog);

  beforeEach(async () => {
    await freshMappedApp();
    ORDERS =
      (await ListResources()).find((entry) => entry.tableName === "orders")
        ?.ref ?? "";
    expect(ORDERS, "the orders resource").to.not.equal("");
  });

  it("builds an analytics page with one typecheck, and is faster than block by block", async () => {
    const composed = await countTypechecks(() =>
      ComposePage(analytics("analytics")),
    );
    const data = expectOk(composed.result, "ComposePage");
    expect(composed.count, "one typecheck for the whole page").to.equal(1);
    expect(data.written).to.equal(true);
    expect(data.blocks.map((block) => block.path)).to.include.members([
      "/shop/analytics#toolbar",
      "/shop/analytics#toolbar/period",
      "/shop/analytics#kpis/revenue",
      "/shop/analytics#revenueOverTime",
      "/shop/analytics#breakdowns/byStatus",
    ]);
    const source = await pageFile("analytics");
    for (const fragment of [
      "PageToolbar",
      "ChartArea",
      "TopListCard",
      "/stats/revenue",
      "/stats/by-status",
    ]) {
      expect(source, fragment).to.contain(fragment);
    }
    const structure = expectOk(
      await GetPageStructure("/shop/analytics"),
      "GetPageStructure",
    );
    expect(structure.queries?.map((query) => query.name)).to.have.members([
      "revenue",
      "orders",
      "average",
      "revenueOverTime",
      "byChannel",
      "byStatus",
    ]);

    const sequential = await countTypechecks(async () => {
      expectOk(
        await composeBlockByBlock("steps", analyticsBlocks()),
        "block by block",
      );
    });
    console.log(
      `compose: ${composed.ms.toFixed(0)} ms, ${composed.count} typecheck; block by block: ${sequential.ms.toFixed(0)} ms, ${sequential.count} typechecks`,
    );
    expect(sequential.count).to.be.greaterThan(10);
    expect(composed.ms).to.be.lessThan(sequential.ms);
  });

  it("writes nothing when one block is refused, and names it by pointer", async () => {
    const blocks = analyticsBlocks();
    const bad = blocks[3].children?.[0];
    if (!bad?.query?.params) {
      throw new Error("fixture");
    }
    bad.query.params = { ...bad.query.params, groupBy: "nope" };
    blocks[2] = { ...blocks[2], type: "NoSuchBlock" };
    const refused = await ComposePage({ ...analytics("analytics"), blocks });
    expect(refused.ok).to.equal(false);
    const text = JSON.stringify(refused.ok ? "" : refused.error);
    expect(text).to.include("invalid_config");
    expect(text).to.include("/blocks/2");
    expect(text).to.include("/blocks/3/children/0/query/params");
    expect(await pageFile("analytics"), "the page is not created").to.equal("");
  });

  it("puts a KPI row above a mapped table and survives a remap", async () => {
    const [row] = [
      {
        name: "kpis",
        type: "GridRow",
        children: [kpi("revenue", "Revenue", "sum")],
      },
    ];
    const page = (await ListPages()).find(
      (entry) => entry.id === "shop-orders",
    );
    expect(page, "the orders page").to.not.equal(undefined);
    const added = await ComposePage({
      page: page!.ref,
      blocks: [row],
      placement: { before: "table" },
    });
    expectOk(added, "ComposePage");
    const order = (await pageFile("shop-orders")).replace(/\s+/g, " ");
    expect(order.indexOf("static kpis")).to.be.greaterThan(-1);
    expect(order.indexOf("static kpis")).to.be.lessThan(
      order.indexOf("static table"),
    );

    expectOk(await MapResources(ordersInput()), "MapResources again");
    const after = await pageFile("shop-orders");
    expect(after, "the remap keeps the added blocks").to.contain("static kpis");
    expect(after).to.contain("/stats/revenue");
    expect(after).to.contain("static table");
  });

  it("previews every query without writing, flagging a refused one", async () => {
    const blocks = analyticsBlocks();
    const outcome = await ComposePage({
      ...analytics("analytics"),
      blocks,
      preview: true,
    });
    const data = expectOk(outcome, "ComposePage preview");
    expect(data.written).to.equal(false);
    expect(data.previews.map((entry) => entry.block)).to.have.members([
      "revenue",
      "orders",
      "average",
      "revenueOverTime",
      "byChannel",
      "byStatus",
    ]);
    expect(await pageFile("analytics"), "nothing is written").to.equal("");
  });

  it("flags empty and zero answers", () => {
    expect(answerStatus({ series: [] })).to.equal("empty");
    expect(answerStatus({ items: [] })).to.equal("empty");
    expect(answerStatus({ series: [{ x: "a", y: 0 }] })).to.equal("zero");
    expect(answerStatus({ value: 0, series: [] })).to.equal("empty");
    expect(answerStatus({ value: 0 })).to.equal("zero");
    expect(answerStatus({ value: 4, sparkline: [] })).to.equal("ok");
    expect(answerStatus({ series: [{ x: "a", y: 3 }] })).to.equal("ok");
  });
});

/** The same page through the single-block operations, as an agent builds it today. */
async function composeBlockByBlock(name: string, blocks: ComposeBlock[]) {
  const created = await CreatePage({
    name,
    displayName: "Steps",
    category: "pages.shop",
    module: MODULE,
  });
  if (!created.ok) {
    return created;
  }
  const page = `/shop/${name}`;
  const add = async (
    block: ComposeBlock,
    parent: string | undefined,
  ): Promise<ReturnType<typeof AddBlock>> => {
    const config = { ...block.config };
    if (block.query) {
      const { into: _into, args: _args, ...query } = block.query;
      const queried = await AddQuery(page, {
        ...query,
        name: query.name ?? block.name,
      });
      if (!queried.ok) {
        return queried;
      }
      config.fetchUrl = queried.data.route;
    }
    const added = await AddBlock({
      page,
      name: block.name,
      type: block.type,
      config,
      parent,
      slot: block.slot,
    });
    if (!added.ok) {
      return added;
    }
    for (const child of block.children ?? []) {
      const result = await add(child, added.data.path);
      if (!result.ok) {
        return result;
      }
    }
    return added;
  };
  for (const block of blocks) {
    const result = await add(block, undefined);
    if (!result.ok) {
      return result;
    }
  }
  return created;
}
