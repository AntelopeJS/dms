import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { OpResult } from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  CreateCategory,
  CreatePage,
  RemoveBlock,
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

function failedFiles(result: OpResult<unknown>): string[] {
  return !result.ok && result.error.code === "typecheck_failed"
    ? result.error.diagnostics.map((diagnostic) => diagnostic.file)
    : [];
}

async function addBanner(name: string) {
  return AddBlock({
    page: PAGE,
    name,
    type: "Banner",
    config: { title: name },
  });
}

/**
 * Once a typecheck of the app found no error, a save checks only what it could
 * have broken. A file that reaches the page through another file still breaks
 * with it, and an engine that checks the saved files and their direct
 * importers alone writes the save.
 */
describe("[unit] a save that breaks a file importing the page", () => {
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
    expectOk(await addBanner("first"), "AddBlock first");
    const pageClass = /export class (\w+)/.exec(app.read(PAGE_FILE))?.[1];
    app.write(
      "board-ref.ts",
      `import { ${pageClass} } from "./board/page";\n\nexport const board = ${pageClass};\n`,
    );
    app.write(
      "board-reader.ts",
      `import { board } from "./board-ref";\n\nexport const banner = board.first;\n`,
    );
    expectOk(await addBanner("second"), "AddBlock with the importers on disk");
  });

  after(() => destroyFixture());

  it("fails on the importer of an importer and leaves the page as it was", async function () {
    this.timeout(OP_TIMEOUT);
    const before = app.read(PAGE_FILE);

    const result = await RemoveBlock(`${PAGE}#first`);

    expect(failedFiles(result)).to.deep.equal([
      path.join(app.root, "src", "board-reader.ts"),
    ]);
    expect(app.read(PAGE_FILE)).to.equal(before);
  });

  /**
   * The importer did not change and no longer resolves the file, so only the
   * imports the clean check read lead to it.
   */
  it("fails on the importer of a file deleted outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    app.write("labels.ts", `export const label = "draft";\n`);
    app.write(
      "labels-user.ts",
      `import { label } from "./labels";\n\nexport const shown = label;\n`,
    );
    expectOk(await addBanner("third"), "AddBlock with the labels on disk");

    fs.rmSync(path.join(app.root, "src", "labels.ts"));
    const result = await addBanner("fourth");

    expect(failedFiles(result)).to.deep.equal([
      path.join(app.root, "src", "labels-user.ts"),
    ]);
  });

  /** A global reaches every file without an import, so its change checks them all. */
  it("fails on a reader of a global edited outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    fs.rmSync(path.join(app.root, "src", "labels-user.ts"));
    const declareTone = (tone: string) =>
      `declare global {\n  const TONE: "${tone}";\n}\n\nexport {};\n`;
    app.write("tone.ts", declareTone("draft"));
    app.write("tone-user.ts", `export const tone: "draft" = TONE;\n`);
    expectOk(await addBanner("fifth"), "AddBlock with the global on disk");

    app.write("tone.ts", declareTone("published"));
    const result = await addBanner("sixth");

    expect(failedFiles(result)).to.deep.equal([
      path.join(app.root, "src", "tone-user.ts"),
    ]);
  });
});
