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
  fs.mkdirSync(path.dirname(source(relativePath)), { recursive: true });
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
    ? result.error.diagnostics.map((diagnostic) =>
        path.normalize(diagnostic.file),
      )
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

/** An app with one page holding one banner, saved once. */
async function createBoard(): Promise<void> {
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
}

function removeWritten(): void {
  written.forEach(remove);
  written = [];
}

describe("[unit] a save that breaks a file the save did not write: once a typecheck of the app found no error, a save checks only what it could have broken, and fails on a file a full check fails on", () => {
  before(async function () {
    this.timeout(120_000);
    await createBoard();
  });

  afterEach(removeWritten);

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

  it("fails on a reader of a global declared from the page's type (the page changes, and a module importing it declares a global from its type, whose readers import neither)", async function () {
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

  it("fails on the importer of a file deleted outside the builder (the importer did not change and no longer resolves the file, so only the imports the clean check read lead to it)", async function () {
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
      `/// <reference path="./referenced" />\nexport const referrer = 1;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the reference on disk");

    remove("referenced.ts");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("referrer.ts")]);
  });

  it("fails on the app's importer of a dependency whose inner file changed (a dependency rebuilt under a running builder changes a declaration file the app reaches through another file of the dependency)", async function () {
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

  it("fails on a reader of a global edited outside the builder (a global reaches every file without an import, so its change checks them all)", async function () {
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

  it("fails on a reader of a namespace a module exports as a global (an `export as namespace` declares a global as well, read here by a script)", async function () {
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

/**
 * A package of the app's workspace, linked into `node_modules` as a package
 * manager links it. Without a tone, its declaration file is not built yet.
 */
function linkWorkspace(name: string, tone?: string): void {
  const workspace = path.join(app.root, "workspace", name);
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({ name, types: "index.d.ts" }),
  );
  if (tone) {
    fs.writeFileSync(
      path.join(workspace, "index.d.ts"),
      `export declare const tone: "${tone}";\n`,
    );
  }
  const link = path.join(app.root, "node_modules", name);
  if (!fs.existsSync(link)) {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(workspace, link, "junction");
  }
}

/** A dependency named `<linked>-wrapper` that re-exports the tone of a linked workspace package. */
function installWrapper(linked: string): void {
  const root = path.join(app.root, "node_modules", `${linked}-wrapper`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: `${linked}-wrapper`, types: "index.d.ts" }),
  );
  fs.writeFileSync(
    path.join(root, "index.d.ts"),
    `export { tone } from "${linked}";\n`,
  );
}

/** A dependency whose entry re-exports a shade from its `shade` folder, or from a `shade.d.ts` beside it once one is added. */
function installShade(added?: string): void {
  const root = path.join(app.root, "node_modules", "fixture-shade");
  fs.mkdirSync(path.join(root, "shade"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture-shade", types: "index.d.ts" }),
  );
  fs.writeFileSync(
    path.join(root, "index.d.ts"),
    `export { shade } from "./shade";\n`,
  );
  fs.writeFileSync(
    path.join(root, "shade", "index.d.ts"),
    `export declare const shade: "draft";\n`,
  );
  if (added) {
    fs.writeFileSync(
      path.join(root, "shade.d.ts"),
      `export declare const shade: "${added}";\n`,
    );
  }
}

describe("[unit] a save after a file outside the app changed how the app resolves: a linked package's files are read where the link points, outside `node_modules`, and the app may reach them only through a dependency", () => {
  before(async function () {
    this.timeout(120_000);
    await createBoard();
  });

  afterEach(removeWritten);

  after(() => destroyFixture());

  it("fails on the app's importer of a dependency re-exporting a linked package that changed", async function () {
    this.timeout(OP_TIMEOUT);
    linkWorkspace("fixture-linked", "draft");
    installWrapper("fixture-linked");
    write(
      "tone-reader.ts",
      `import { tone } from "fixture-linked-wrapper";\n\nexport const shown: "draft" = tone;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the linked package");

    linkWorkspace("fixture-linked", "published");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("tone-reader.ts")]);
  });

  it("fails on the app's importer of a dependency whose import a new file now resolves (a file added to a dependency changes what an unchanged file of it imports, once a new file of the app makes the program resolve its imports again)", async function () {
    this.timeout(OP_TIMEOUT);
    installShade();
    write(
      "shade-dependency-user.ts",
      `import { shade } from "fixture-shade";\n\nexport const shown: "draft" = shade;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the dependency installed");

    installShade("published");
    write("unrelated.ts", `export {};\n`);
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([
      source("shade-dependency-user.ts"),
    ]);
  });

  it("fails on the app's importer of a dependency re-exporting a linked package built since (the dependency did not change, and the linked package it imports from is built once the app holds a new file, so the program resolves it again)", async function () {
    this.timeout(OP_TIMEOUT);
    linkWorkspace("fixture-late");
    installWrapper("fixture-late");
    write(
      "late-reader.ts",
      `import { tone } from "fixture-late-wrapper";\n\nexport const shown: "draft" = tone;\n`,
    );
    expectOk(await addBanner(), "AddBlock before the linked package is built");

    linkWorkspace("fixture-late", "published");
    write("late-unrelated.ts", `export {};\n`);
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("late-reader.ts")]);
  });

  it("fails on an importer whose import a new file now resolves (the importer did not change, and the file it resolves to now is new)", async function () {
    this.timeout(OP_TIMEOUT);
    write("shade/index.ts", `export const shade = "draft";\n`);
    write(
      "shade-user.ts",
      `import { shade } from "./shade";\n\nexport const shown: "draft" = shade;\n`,
    );
    expectOk(await addBanner(), "AddBlock with the folder module");

    write("shade.ts", `export const shade = "published";\n`);
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("shade-user.ts")]);
  });
});

const augmentation = `export {};\n\ndeclare module "./augmented" {\n  interface Target {\n    b: number;\n  }\n}\n`;

describe("[unit] a save after a file another reads without importing it changed: a file that augments a module or declares a global is read by files that do not import it, so a change on one side checks the other", () => {
  before(async function () {
    this.timeout(120_000);
    await createBoard();
  });

  afterEach(removeWritten);

  after(() => destroyFixture());

  it("fails on the augmentation of a module edited outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    write("augmented.ts", `export interface Target {\n  a: string;\n}\n`);
    write("augmentation.ts", augmentation);
    expectOk(await addBanner(), "AddBlock with the augmentation on disk");

    write(
      "augmented.ts",
      `export interface Target {\n  a: string;\n  b: string;\n}\n`,
    );
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("augmentation.ts")]);
  });

  it("fails on the augmentation of a module deleted outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    write("augmented.ts", `export interface Target {\n  a: string;\n}\n`);
    write("augmentation.ts", augmentation);
    expectOk(await addBanner(), "AddBlock with the augmentation on disk");

    remove("augmented.ts");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("augmentation.ts")]);
  });

  it("fails on a reader of a global whose file was deleted outside the builder", async function () {
    this.timeout(OP_TIMEOUT);
    write(
      "shade-global.ts",
      `declare global {\n  const SHADE: "draft";\n}\n\nexport {};\n`,
    );
    write("shade-reader.ts", `export const shade: "draft" = SHADE;\n`);
    expectOk(await addBanner(), "AddBlock with the global on disk");

    remove("shade-global.ts");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([source("shade-reader.ts")]);
  });
});
