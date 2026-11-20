import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  AddBlock,
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
const OP_TIMEOUT = 60_000;

let app: Fixture;

/** A package of the app that ships only a declaration file, as a dependency in `node_modules` does. */
function writeLabelsPackage(accepted: string): void {
  const root = path.join(app.root, "node_modules", "fixture-labels");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture-labels", types: "index.d.ts" }),
  );
  fs.writeFileSync(
    path.join(root, "index.d.ts"),
    `export declare function label(value: "${accepted}"): string;\n`,
  );
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
 * A dependency rebuilt or upgraded under a running builder changes a
 * declaration file the engine already parsed. The next operation must
 * typecheck against the new text; an engine that keeps the parse it read first
 * accepts code the dependency no longer does.
 */
describe("[unit] a declaration file edited between two builder operations", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    writeLabelsPackage("draft");
    app.write(
      "labels.ts",
      `import { label } from "fixture-labels";\n\nexport const status = label("draft");\n`,
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
  });

  after(() => destroyFixture());

  it("is parsed again by the next operation's typecheck", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await addBanner("first"), "AddBlock before the edit");

    writeLabelsPackage("published");
    const result = await addBanner("second");

    expect(result.ok).to.equal(false);
    const diagnostics =
      !result.ok && result.error.code === "typecheck_failed"
        ? result.error.diagnostics
        : [];
    expect(
      diagnostics.map((diagnostic) => path.normalize(diagnostic.file)),
    ).to.deep.equal([path.join(app.root, "src", "labels.ts")]);
  });

  /**
   * A reinstall or a `rimraf dist` removes a declaration file for a moment. An
   * engine that drops it leaves its importers unresolved after it is back,
   * because TypeScript keeps the failed resolution of a file that did not change.
   */
  it("keeps its last text while it is gone and resolves it once it is back", async function () {
    this.timeout(OP_TIMEOUT);
    writeLabelsPackage("draft");
    expectOk(await addBanner("third"), "AddBlock before the removal");

    const declaration = path.join(
      app.root,
      "node_modules",
      "fixture-labels",
      "index.d.ts",
    );
    fs.rmSync(declaration);
    expectOk(await addBanner("fourth"), "AddBlock while it is gone");

    writeLabelsPackage("draft");
    expectOk(await addBanner("fifth"), "AddBlock once it is back");
  });
});
