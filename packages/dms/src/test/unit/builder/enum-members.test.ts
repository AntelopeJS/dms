import { expect } from "chai";
import type { BlockDraft, BlockNode } from "@antelopejs/interface-dms-builder";
import {
  CreateCategory,
  CreatePage,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const PAGE_FILE = "board/page.ts";
const REMOTE_FILE = "shop-remote.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function revenueKpi(): Promise<BlockNode> {
  const { blocks } = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  const [block] = blocks;
  expect(block?.name).to.equal("revenueKpi");
  return block;
}

/** Write the block's options by hand, the way its author would. */
function handWrite(options: string): void {
  const page = app.read(PAGE_FILE);
  const written = page.replace(
    /static revenueKpi = KpiCard\([^;]*\);/,
    `static revenueKpi = KpiCard({ ${options} });`,
  );
  expect(written, "the fixture holds the block").to.not.equal(page);
  app.write(PAGE_FILE, written);
}

async function save(
  config: NonNullable<BlockDraft["config"]>,
): Promise<string> {
  const { version } = expectOk(
    await GetPageStructure(PAGE),
    "GetPageStructure",
  );
  expectOk(
    await SetPageBlocks(
      PAGE,
      { blocks: [{ name: "revenueKpi", type: "KpiCard", config }] },
      { expectedVersion: version },
    ),
    "SetPageBlocks",
  );
  return app.read(PAGE_FILE);
}

function writeRemote(stats: string): void {
  app.write(
    REMOTE_FILE,
    `export enum RemoteApi { stats = ${JSON.stringify(stats)} }\n`,
  );
}

/** A board page holding the enums the tests read, in a fresh app. */
async function createBoard(this: Mocha.Context): Promise<void> {
  this.timeout(120_000);
  app = createFixture();
  writeRemote("/api/remote");
  expectOk(
    await CreateCategory({ name: "shop", displayName: "Shop" }),
    "CreateCategory",
  );
  expectOk(
    await CreatePage({
      name: "board",
      displayName: "Board",
      category: "pages.shop",
    }),
    "CreatePage",
  );
  expectOk(
    await SetPageBlocks(PAGE, {
      blocks: [
        { name: "revenueKpi", type: "KpiCard", config: { title: "Revenue" } },
      ],
    }),
    "SetPageBlocks",
  );
  const page = app
    .read(PAGE_FILE)
    .replace(
      "@RegisterPage(",
      [
        'import { HttpMethod } from "@antelopejs/interface-dms/base/types";',
        'import * as Remote from "../shop-remote";',
        "",
        'const enum ShopApi { stats = "/api/shop/stats", orders = "/api/shop/orders" }',
        "enum Drawn { seed = Math.random() }",
        "enum Huge { far = 1 / 0 }",
        "enum Routed { remote = Remote.RemoteApi.stats }",
        "",
        "@RegisterPage(",
      ].join("\n"),
    );
  expect(page, "the fixture holds the enums").to.contain("const enum ShopApi");
  app.write(PAGE_FILE, page);
}

/**
 * An option an author sets from an enum, `HttpMethod.get`, is as fixed as a
 * literal: the builder reads the member's value, and writes a member back
 * whenever one holds the value saved.
 */
describe("a block option set from an enum member", () => {
  before(createBoard);
  after(() => destroyFixture());

  it("reads an imported string enum member as its value", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      'title: "Revenue", fetchUrl: "/api/revenue", fetchUrlMethod: HttpMethod.get',
    );
    const block = await revenueKpi();

    expect(block.lockedOptions).to.equal(undefined);
    expect(block.config).to.deep.equal({
      title: "Revenue",
      fetchUrl: "/api/revenue",
      fetchUrlMethod: "GET",
    });
  });

  it("reads a member of a const enum declared on the page as its value", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: ShopApi.stats');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.equal(undefined);
    expect(block.config?.fetchUrl).to.equal("/api/shop/stats");
  });

  it("locks a member whose value only runs at startup", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: Drawn.seed');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.have.property("fetchUrl");
  });

  it("locks a member whose value JSON cannot carry", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: Huge.far');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.have.property("fetchUrl");
  });

  it("refuses a save as stale once a member read through a namespace import changed", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: Routed.remote');
    const { version } = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    writeRemote("/api/remote-v2");
    try {
      const result = await SetPageBlocks(
        PAGE,
        {
          blocks: [
            {
              name: "revenueKpi",
              type: "KpiCard",
              config: { title: "Revenue", fetchUrl: "/api/remote" },
            },
          ],
        },
        { expectedVersion: version },
      );

      expect(result.ok ? "saved" : result.error.code).to.equal("stale");
      expect(app.read(PAGE_FILE)).to.contain("fetchUrl: Routed.remote");
    } finally {
      writeRemote("/api/remote");
    }
  });

  it("keeps the member through a save that did not change its value", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      'title: "Revenue", fetchUrl: "/api/revenue", fetchUrlMethod: HttpMethod.get',
    );
    const written = await save({
      title: "Income",
      fetchUrl: "/api/revenue",
      fetchUrlMethod: "GET",
    });

    expect(written).to.contain("fetchUrlMethod: HttpMethod.get");
    expect(written).to.not.contain('"GET"');
  });

  it("writes the member that holds an edited value", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      'title: "Revenue", fetchUrl: "/api/revenue", fetchUrlMethod: HttpMethod.get',
    );
    const written = await save({
      title: "Revenue",
      fetchUrl: "/api/revenue",
      fetchUrlMethod: "POST",
    });

    expect(written).to.contain("fetchUrlMethod: HttpMethod.post");
    expect(written).to.not.contain('"POST"');
  });

  it("writes a literal once no member holds the edited value", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: ShopApi.stats');
    const kept = await save({ title: "Revenue", fetchUrl: "/api/shop/orders" });
    expect(kept).to.contain("fetchUrl: ShopApi.orders");

    handWrite('title: "Revenue", fetchUrl: ShopApi.stats');
    const written = await save({ title: "Revenue", fetchUrl: "/api/other" });
    expect(written).to.contain('fetchUrl: "/api/other"');
    expect(written).to.not.contain("fetchUrl: ShopApi.");
  });
});
