import { expect } from "chai";
import type { PageDraft } from "@antelopejs/interface-dms-builder";
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
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** Write the page's `permission` and `live` options by hand, the way its author would. */
function handWrite(options: string): void {
  const page = app.read(PAGE_FILE);
  const written = page.replace(
    /displayName: "Board",(\s*permission: [^\n]*\s*live: [^\n]*)?/,
    `displayName: "Board",\n  ${options},`,
  );
  expect(written, "the fixture holds the page options").to.not.equal(page);
  app.write(PAGE_FILE, written);
}

/** Save the page with the given options and its blocks as read, then read the file. */
async function save(page: NonNullable<PageDraft["page"]>): Promise<string> {
  const { version, blocks } = expectOk(
    await GetPageStructure(PAGE),
    "GetPageStructure",
  );
  expectOk(
    await SetPageBlocks(
      PAGE,
      {
        page,
        blocks: blocks.map((block) => ({
          name: block.name,
          type: block.type ?? undefined,
          config: block.config,
        })),
      },
      { expectedVersion: version },
    ),
    "SetPageBlocks",
  );
  return app.read(PAGE_FILE);
}

/** Save the page with the options it was read with, unchanged. */
async function echo(): Promise<string> {
  const { page } = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return save({ permission: page.permission, live: page.live });
}

/** A board page holding the constants the tests read, in a fresh app. */
async function createBoard(this: Mocha.Context): Promise<void> {
  this.timeout(120_000);
  app = createFixture();
  app.write(
    "shop-api.ts",
    'export const SHOP_SCOPE = "shop";\nexport const SHOP_RATE = 5;\n',
  );
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
        'import { SHOP_RATE, SHOP_SCOPE } from "../shop-api";',
        "",
        'const BOARD_ID = "shop.board";',
        "const RATE = 10;",
        "",
        "@RegisterPage(",
      ].join("\n"),
    );
  expect(page, "the fixture holds the constants").to.contain("const BOARD_ID");
  app.write(PAGE_FILE, page);
}

/**
 * A page's `permission` and `live` options an author wrote with named values
 * keep those names through a draft save that sends them back unchanged, as a
 * block's options do.
 */
describe("a page option written with constants, saved through a draft", () => {
  before(createBoard);
  after(() => destroyFixture());

  it("reads the values the constants hold", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      "permission: { id: `${SHOP_SCOPE}.board` },\n  live: { maxRate: SHOP_RATE }",
    );
    const { page } = expectOk(await GetPageStructure(PAGE), "GetPageStructure");

    expect(page.permission).to.deep.equal({ id: "shop.board" });
    expect(page.live).to.deep.equal({ maxRate: 5 });
  });

  it("keeps same-file constants sent back unchanged", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite("permission: { id: BOARD_ID },\n  live: { maxRate: RATE }");
    const written = await echo();

    expect(written).to.contain("permission: { id: BOARD_ID }");
    expect(written).to.contain("live: { maxRate: RATE }");
  });

  it("keeps an imported constant and a template sent back unchanged", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      "permission: { id: `${SHOP_SCOPE}.board` },\n  live: { maxRate: SHOP_RATE }",
    );
    const written = await echo();

    expect(written).to.contain("permission: { id: `${SHOP_SCOPE}.board` }");
    expect(written).to.contain("live: { maxRate: SHOP_RATE }");
    expect(written, "the import they read stays").to.contain(
      'import { SHOP_RATE, SHOP_SCOPE } from "../shop-api";',
    );
  });

  it("writes an edited same-file constant as the value, and keeps the unedited one", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite("permission: { id: BOARD_ID },\n  live: { maxRate: RATE }");
    const written = await save({
      permission: { id: "shop.board" },
      live: { maxRate: 30 },
    });

    expect(written).to.contain("live: { maxRate: 30 }");
    expect(written).to.contain("permission: { id: BOARD_ID }");
  });

  it("writes an edited imported constant and template as the values", async function () {
    this.timeout(OP_TIMEOUT);
    handWrite(
      "permission: { id: `${SHOP_SCOPE}.board` },\n  live: { maxRate: SHOP_RATE }",
    );
    const written = await save({
      permission: { id: "shop.admin" },
      live: { maxRate: 30 },
    });

    expect(written).to.contain('permission: { id: "shop.admin" }');
    expect(written).to.contain("live: { maxRate: 30 }");
    expect(written, "the import no option reads is pruned").to.not.contain(
      "../shop-api",
    );
  });
});
