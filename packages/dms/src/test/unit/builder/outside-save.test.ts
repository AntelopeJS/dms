import { expect } from "chai";
import {
  AddBlock,
  CreateCategory,
  CreatePage,
} from "../../../implementations/dms-builder";
import {
  commit,
  isError,
  openPage,
  contentVersion,
  Transaction,
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

/** A line the developer's editor appends, named so each test adds its own. */
function outsideLine(name: string): string {
  return `\nexport const ${name} = 1;\n`;
}

/**
 * Opens the page the way every mutation does, then hands back the transaction
 * that has read it, so a test can land an outside save before the commit.
 */
function openTransaction() {
  const context = openPage(PAGE);
  if (isError(context)) {
    throw new Error(`openPage failed: ${JSON.stringify(context)}`);
  }
  const { sourceFile } = context;
  return { transaction: new Transaction(sourceFile.getProject()), sourceFile };
}

/**
 * A save from the developer's editor that lands after a builder operation read
 * the page and before it wrote it back. The write must refuse as `stale` and
 * leave the outside save on disk; a flush that writes its own text without
 * comparing loses it.
 */
describe("an outside save during a builder write", () => {
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
  });

  after(() => destroyFixture());

  it("refuses an edit as stale and keeps the outside save", async function () {
    this.timeout(OP_TIMEOUT);
    const { transaction, sourceFile } = openTransaction();
    transaction.track(sourceFile);
    sourceFile.addStatements("export const builderEdit = 1;");
    const outside = app.read(PAGE_FILE) + outsideLine("savedOutside");
    app.write(PAGE_FILE, outside);

    const result = commit(transaction, undefined);

    expect(result).to.deep.equal({
      ok: false,
      error: {
        code: "stale",
        ref: sourceFile.getFilePath(),
        currentVersion: contentVersion(outside),
      },
    });
    expect(app.read(PAGE_FILE)).to.equal(outside);

    expectOk(
      await AddBlock({
        page: PAGE,
        name: "afterKpi",
        type: "KpiCard",
        config: {},
      }),
      "AddBlock",
    );
    expect(app.read(PAGE_FILE), "a retry reads the outside save").to.contain(
      "savedOutside",
    );
  });

  it("refuses a delete as stale and keeps the outside save", function () {
    this.timeout(OP_TIMEOUT);
    const { transaction, sourceFile } = openTransaction();
    const path = sourceFile.getFilePath();
    transaction.trackDelete(sourceFile);
    const outside = app.read(PAGE_FILE) + outsideLine("savedBeforeDelete");
    app.write(PAGE_FILE, outside);

    const result = commit(transaction, undefined);

    expect(result).to.deep.equal({
      ok: false,
      error: {
        code: "stale",
        ref: path,
        currentVersion: contentVersion(outside),
      },
    });
    expect(app.read(PAGE_FILE)).to.equal(outside);
  });
});
