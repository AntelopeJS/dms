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
const API_FILE = "shop-api.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

async function revenueKpi(): Promise<BlockNode> {
  const { blocks } = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  const [block] = blocks;
  expect(block?.name).to.equal("revenueKpi");
  return block;
}

function writeApi(shopApi: string): void {
  app.write(
    API_FILE,
    `export const SHOP_API = ${JSON.stringify(shopApi)};\nconst DEFAULT_API = "/api/default";\nexport default DEFAULT_API;\n`,
  );
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

/** A board page holding the constants the tests read, in a fresh app. */
async function createBoard(this: Mocha.Context): Promise<void> {
  this.timeout(120_000);
  app = createFixture();
  writeApi("/api/shop");
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
        'import ShopDefault, { SHOP_API } from "../shop-api";',
        "",
        'const STATS = "stats";',
        "const LIMIT = 20;",
        "const BASE = `${SHOP_API}/v1`;",
        'let live = "live";',
        "",
        "@RegisterPage(",
      ].join("\n"),
    );
  expect(page, "the fixture holds the constants").to.contain("const STATS");
  app.write(PAGE_FILE, page);
}

/**
 * A route or topic an author builds from named strings, `${API}/stats`, is as
 * fixed as a literal: the builder reads the string it builds and keeps the
 * template while that string is unchanged.
 */
describe("a block option built as a template of constants", () => {
  before(createBoard);
  after(() => destroyFixture());

  it("reads a template of a local and an imported constant as the string it builds", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      'title: "Revenue", fetchUrl: `${SHOP_API}/${STATS}?limit=${LIMIT}&range={{query.range}}`',
    );
    const block = await revenueKpi();

    expect(block.editable, "a template of constants locks nothing").to.equal(
      true,
    );
    expect(block.lockedOptions).to.equal(undefined);
    expect(block.config).to.deep.equal({
      title: "Revenue",
      fetchUrl: "/api/shop/stats?limit=20&range={{query.range}}",
    });
  });

  it("follows a constant that is itself a template of constants", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `${BASE}/totals`');
    const block = await revenueKpi();

    expect(block.config?.fetchUrl).to.equal("/api/shop/v1/totals");
  });

  it("locks a template that reads a default import, which a save would leave behind", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `${ShopDefault}/k`');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.have.property("fetchUrl");
  });

  it("locks a template that reads a variable, and keeps it unchanged on save", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `/api/${live}`');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.have.property("fetchUrl");
    expect(block.config).to.not.have.property("fetchUrl");

    const written = await save({ title: "Income" });
    expect(written).to.contain("fetchUrl: `/api/${live}`");
  });

  it("locks a template that calls code", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `/api/${STATS.toUpperCase()}`');
    const block = await revenueKpi();

    expect(block.lockedOptions).to.have.property("fetchUrl");
  });
});

describe("a template of constants written back on save", () => {
  before(createBoard);
  after(() => destroyFixture());

  it("reads an imported constant, and keeps its name through a save", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: SHOP_API');
    const block = await revenueKpi();

    expect(block.config?.fetchUrl).to.equal("/api/shop");
    const written = await save({ title: "Income", fetchUrl: "/api/shop" });
    expect(written).to.contain("fetchUrl: SHOP_API");
  });

  it("refuses a save as stale once an imported constant changed since the read", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: SHOP_API');
    const { version } = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    writeApi("/api/shop-v2");
    try {
      const result = await SetPageBlocks(
        PAGE,
        {
          blocks: [
            {
              name: "revenueKpi",
              type: "KpiCard",
              config: { title: "Revenue", fetchUrl: "/api/shop" },
            },
          ],
        },
        { expectedVersion: version },
      );

      expect(result.ok ? "saved" : result.error.code).to.equal("stale");
      expect(app.read(PAGE_FILE)).to.contain("fetchUrl: SHOP_API");
    } finally {
      writeApi("/api/shop");
    }
  });

  it("saves through a constants file created after the engine loaded, once that file changed", async function () {
    this.timeout(OP_TIMEOUT);
    const writeLate = (value: string) =>
      app.write(
        "late-api.ts",
        `export const LATE_API = ${JSON.stringify(value)};\n`,
      );
    writeLate("/api/late");
    app.write(
      PAGE_FILE,
      `import { LATE_API } from "../late-api";\n${app.read(PAGE_FILE)}`,
    );
    handWrite('title: "Revenue", fetchUrl: `${LATE_API}/k`');
    await save({ title: "Revenue", fetchUrl: "/api/late/k" });
    writeLate("/api/late-v2");

    const block = await revenueKpi();
    expect(block.config?.fetchUrl).to.equal("/api/late-v2/k");
    const written = await save({ title: "Income", fetchUrl: "/api/late-v2/k" });
    expect(written).to.contain("fetchUrl: `${LATE_API}/k`");
  });

  it("keeps the template through a save that did not change the string", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `${SHOP_API}/${STATS}`');
    const written = await save({
      title: "Income",
      fetchUrl: "/api/shop/stats",
    });

    expect(written).to.contain("fetchUrl: `${SHOP_API}/${STATS}`");
    expect(written, "the import the template reads stays").to.contain(
      'import ShopDefault, { SHOP_API } from "../shop-api";',
    );
  });

  it("writes the string out once the author changes it", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite('title: "Revenue", fetchUrl: `${SHOP_API}/${STATS}`');
    const written = await save({ title: "Revenue", fetchUrl: "/api/other" });

    expect(written).to.contain('fetchUrl: "/api/other"');
    expect(written).to.not.contain("`${SHOP_API}/${STATS}`");
  });
});
