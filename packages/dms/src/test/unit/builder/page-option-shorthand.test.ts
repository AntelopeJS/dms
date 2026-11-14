import { expect } from "chai";
import {
  ConfigurePage,
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
const LABELS_FILE = "board/labels.ts";
const OP_TIMEOUT = 60_000;
const RENAMED = "Shop board";

let app: Fixture;
let emitted = "";

/**
 * The page as its author would write it: the title is a binding, passed to the
 * options as the shorthand `{ displayName, }`.
 *
 * @param binding The statement that binds `displayName`, written above the page
 */
function writeShorthand(binding: string): void {
  const written = emitted
    .replace('displayName: "Board",', "displayName,")
    .replace("@RegisterPage(", `${binding}\n\n@RegisterPage(`);
  expect(written, "the page holds the shorthand").to.contain("displayName,");
  expect(written, "the page holds the binding").to.contain(binding);
  app.write(PAGE_FILE, written);
}

async function renameThroughDraft(): Promise<void> {
  const { version } = expectOk(
    await GetPageStructure(PAGE),
    "GetPageStructure",
  );
  expectOk(
    await SetPageBlocks(
      PAGE,
      { page: { displayName: RENAMED }, blocks: [] },
      { expectedVersion: version },
    ),
    "SetPageBlocks",
  );
}

async function renameThroughConfigurePage(): Promise<void> {
  expectOk(
    await ConfigurePage(PAGE, { displayName: RENAMED }),
    "ConfigurePage",
  );
}

async function readTitle(): Promise<string> {
  const { page } = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return page.displayName;
}

function displayNameOptions(source: string): string[] {
  return source.match(/^\s*displayName\b.*$/gm) ?? [];
}

function replacesTheShorthand(rename: () => Promise<void>): void {
  it("writes the new title once, where the shorthand was", async function () {
    this.timeout(OP_TIMEOUT);
    writeShorthand('const displayName = "Board";');

    await rename();

    expect(displayNameOptions(app.read(PAGE_FILE))).to.deep.equal([
      `    displayName: "${RENAMED}",`,
    ]);
    expect(await readTitle()).to.equal(RENAMED);
  });

  it("drops the constant only the shorthand read", async function () {
    this.timeout(OP_TIMEOUT);
    writeShorthand('const displayName = "Board";');

    await rename();

    expect(app.read(PAGE_FILE)).to.not.contain("const displayName");
  });

  it("keeps a constant something else still reads", async function () {
    this.timeout(OP_TIMEOUT);
    const binding = [
      'const displayName = "Board";',
      "export const boardHeading = displayName;",
    ].join("\n");
    writeShorthand(binding);

    await rename();

    expect(app.read(PAGE_FILE)).to.contain(binding);
    expect(await readTitle()).to.equal(RENAMED);
  });

  it("drops an import only the shorthand read", async function () {
    this.timeout(OP_TIMEOUT);
    app.write(LABELS_FILE, 'export const displayName = "Board";\n');
    writeShorthand('import { displayName } from "./labels";');

    await rename();

    expect(app.read(PAGE_FILE)).to.not.contain("./labels");
    expect(await readTitle()).to.equal(RENAMED);
  });
}

/**
 * A page option written as a shorthand (`{ displayName, }`) is replaced by the
 * patch, not kept beside it: two `displayName` members fail the typecheck every
 * save runs.
 */
describe("a page option written as a shorthand", () => {
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
    emitted = app.read(PAGE_FILE);
  });

  after(() => destroyFixture());

  describe("renamed through a page draft", () => {
    replacesTheShorthand(renameThroughDraft);
  });

  describe("renamed through ConfigurePage", () => {
    replacesTheShorthand(renameThroughConfigurePage);
  });
});
