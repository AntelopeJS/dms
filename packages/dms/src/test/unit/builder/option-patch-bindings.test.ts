import { expect } from "chai";
import {
  AddBlock,
  ConfigureBlock,
  ConfigurePage,
  CreateCategory,
  CreatePage,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const CHILD = `${PAGE}#row/rowKpi`;
const PAGE_FILE = "board/page.ts";
const LABELS_FILE = "board/labels.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;
let emitted = "";

/**
 * Writes the page with `binding` above it and `from` replaced by `to`.
 *
 * @param from Text of the emitted page to replace
 * @param to What the author wrote there instead
 * @param binding The statements written above the page
 */
function writePage(from: string, to: string, binding: string): void {
  const written = emitted
    .replace(from, to)
    .replace("@RegisterPage(", `${binding}\n\n@RegisterPage(`);
  expect(written, "the page holds the edit").to.contain(to);
  app.write(PAGE_FILE, written);
}

/**
 * A patch drops the bindings only its replaced values read, and keeps every
 * other one: those the rest of the same operation reads, and those the author
 * left unused.
 */
describe("the bindings a patched option read", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
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
      await AddBlock({ page: PAGE, name: "row", type: "GridRow", config: {} }),
      "AddBlock row",
    );
    expectOk(
      await AddBlock({
        page: PAGE,
        name: "rowKpi",
        type: "KpiCard",
        config: { title: "Orders" },
        parent: `${PAGE}#row`,
        meta: { colSpan: 1 },
      }),
      "AddBlock rowKpi",
    );
    emitted = app.read(PAGE_FILE);
  });

  after(() => destroyFixture());

  it("keeps a constant the block's new metadata reads", async function () {
    this.timeout(OP_TIMEOUT);
    writePage('title: "Orders"', "title: label", 'const label = "Orders";');

    expectOk(
      await ConfigureBlock(
        CHILD,
        { title: "New" },
        { meta: { colSpan: { $expr: "label.length" } } },
      ),
      "ConfigureBlock",
    );

    expect(app.read(PAGE_FILE)).to.contain('const label = "Orders";');
  });

  it("keeps an unused constant spelled like a replaced property", async function () {
    this.timeout(OP_TIMEOUT);
    app.write(LABELS_FILE, 'export const board = "Board";\n');
    const draft = 'const board = "draft";';
    writePage(
      'displayName: "Board"',
      "displayName: labels.board",
      `import * as labels from "./labels";\n${draft}`,
    );

    expectOk(
      await ConfigurePage(PAGE, { displayName: "Shop board" }),
      "ConfigurePage",
    );

    const page = app.read(PAGE_FILE);
    expect(page).to.contain(draft);
    expect(page).to.not.contain("./labels");
  });
});
