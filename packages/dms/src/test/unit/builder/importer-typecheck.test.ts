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
let pageClass: string | undefined;
let written: string[] = [];
let banners = 0;

/** Write a file under the app's `src` that the next test no longer finds. */
function write(relativePath: string, content: string): void {
  app.write(relativePath, content);
  written.push(relativePath);
}

function remove(relativePath: string): void {
  fs.rmSync(path.join(app.root, "src", relativePath), { force: true });
}

function source(relativePath: string): string {
  return path.join(app.root, "src", relativePath);
}

/** A dependency whose entry re-exports the tone another of its files declares. */
function installTone(tone: string): void {
  const root = path.join(app.root, "node_modules", "fixture-tone");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture-tone", types: "index.d.ts" }),
  );
  fs.writeFileSync(
    path.join(root, "index.d.ts"),
    `export { tone } from "./tone";\n`,
  );
  fs.writeFileSync(
    path.join(root, "tone.d.ts"),
    `export declare const tone: "${tone}";\n`,
  );
}

function failedFiles(result: OpResult<unknown>): string[] {
  return !result.ok && result.error.code === "typecheck_failed"
    ? result.error.diagnostics.map((diagnostic) => diagnostic.file)
    : [];
}

async function addBanner() {
  banners += 1;
  return AddBlock({
    page: PAGE,
    name: `banner${banners}`,
    type: "Banner",
    config: { title: `Banner ${banners}` },
  });
}

/**
 * Once a typecheck of the app found no error, a save checks only what it could
 * have broken. Each case starts from a clean save, so the save under test goes
 * through that narrower check, and fails on a file a full check fails on.
 */
describe("[unit] a save that breaks a file the save did not write", () => {
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
    expectOk(await addBanner(), "AddBlock");
    pageClass = /export class (\w+)/.exec(app.read(PAGE_FILE))?.[1];
  });

  afterEach(() => {
    written.forEach(remove);
    written = [];
  });

  after(() => destroyFixture());

  it("fails on the importer of an importer and leaves the page as it was", async function () {
    this.timeout(OP_TIMEOUT);
    write(
      "board-ref.ts",
      `import { ${pageClass} } from "./board/page";\n\nexport const board = ${pageClass};\n`,
    );
    write(
      "board-reader.ts",
      `import { board } from "./board-ref";\n\nexport const banner = board.banner1;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the importers on disk");
    const before = app.read(PAGE_FILE);

    const result = await RemoveBlock(`${PAGE}#banner1`);

    expect(failedFiles(result)).to.deep.equal([source("board-reader.ts")]);
    expect(app.read(PAGE_FILE)).to.equal(before);
  });

  /**
   * The page changes, and a module importing it declares a global from its
   * type: the readers of that global import neither.
   */
  it("fails on a reader of a global declared from the page's type", async function () {
    this.timeout(OP_TIMEOUT);
    write(
      "board-global.ts",
      `import type { ${pageClass} } from "./board/page";\n\ndeclare global {\n  const BOARD: typeof ${pageClass};\n}\n`,
    );
    write("board-use.ts", `export const banner = BOARD.banner1;\n`);
    expectOk(await addBanner(), "AddBlock with the global on disk");

    const result = await RemoveBlock(`${PAGE}#banner1`);

    expect(failedFiles(result)).to.deep.equal([source("board-use.ts")]);
  });

  /**
   * The importer did not change and no longer resolves the file, so only the
   * imports the clean check read lead to it.
   */
  it("fails on the importer of a file deleted outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    write("labels.ts", `export const label = "draft";\n`);
    write(
      "labels-user.ts",
      `import { label } from "./labels";\n\nexport const shown = label;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the labels on disk");

    remove("labels.ts");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("labels-user.ts")]);
  });

  it("fails on a file whose `/// <reference path>` was deleted outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    write("referenced.ts", `export {};\n`);
    write(
      "referrer.ts",
      `/// <reference path="./referenced.ts" />\nexport const referrer = 1;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the reference on disk");

    remove("referenced.ts");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("referrer.ts")]);
  });

  /**
   * A dependency rebuilt under a running builder changes a declaration file the
   * app reaches through another file of the dependency.
   */
  it("fails on the app's importer of a dependency whose inner file changed", async function () {
    this.timeout(OP_TIMEOUT);
    installTone("draft");
    write(
      "tone-reader.ts",
      `import { tone } from "fixture-tone";\n\nexport const shown: "draft" = tone;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the dependency installed");

    installTone("published");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("tone-reader.ts")]);
  });

  /** A global reaches every file without an import, so its change checks them all. */
  it("fails on a reader of a global edited outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    const declareTone = (tone: string) =>
      `declare global {\n  const TONE: "${tone}";\n}\n\nexport {};\n`;
    write("tone.ts", declareTone("draft"));
    write("tone-user.ts", `export const tone: "draft" = TONE;\n`);
    expectOk(await addBanner(), "AddBlock with the global on disk");

    write("tone.ts", declareTone("published"));
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("tone-user.ts")]);
  });

  /** An `export as namespace` declares a global as well, read here by a script. */
  it("fails on a reader of a namespace a module exports as a global", async function () {
    this.timeout(OP_TIMEOUT);
    const declareLib = (tone: string) =>
      `export declare const tone: "${tone}";\nexport as namespace Lib;\n`;
    write("lib.d.ts", declareLib("draft"));
    write("lib-user.ts", `const libTone: "draft" = Lib.tone;\n`);
    expectOk(await addBanner(), "AddBlock with the namespace on disk");

    write("lib.d.ts", declareLib("published"));
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("lib-user.ts")]);
  });
});
