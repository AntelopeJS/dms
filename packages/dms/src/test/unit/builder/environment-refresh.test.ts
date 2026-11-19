import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  AddBlock,
  CreateCategory,
  CreatePage,
} from "../../../implementations/dms-builder";
import {
  getWritableProject,
  indexedProject,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
  TSCONFIG,
} from "./harness";

const PAGE = "/shop/board";
const OP_TIMEOUT = 60_000;

let app: Fixture;
let banners = 0;

function nodeModules(...segments: string[]): string {
  return path.join(app.root, "node_modules", ...segments);
}

/** A version of the `fixture-labels` package under its own folder, whose `label` accepts one value. */
function writeLabelsVersion(version: string, accepted: string): void {
  fs.mkdirSync(nodeModules("fixture-labels", version), { recursive: true });
  fs.writeFileSync(
    nodeModules("fixture-labels", version, "index.d.ts"),
    `export declare function label(value: "${accepted}"): string;\n`,
  );
}

/**
 * Point `fixture-labels` at one version, as an upgrade relinks a package, and record the
 * install as pnpm does. The old version's files stay on disk.
 */
function installLabels(version: string): void {
  fs.writeFileSync(
    nodeModules("fixture-labels", "package.json"),
    JSON.stringify({
      name: "fixture-labels",
      types: `${version}/index.d.ts`,
    }),
  );
  fs.writeFileSync(nodeModules(".modules.yaml"), `layoutVersion: ${version}\n`);
}

/** A `tsconfig.json` as this suite writes it. */
interface Tsconfig {
  extends?: string;
  compilerOptions?: Partial<typeof TSCONFIG.compilerOptions> & {
    paths?: Record<string, string[]>;
  };
  include?: string[];
}

function writeConfig(name: string, config: Tsconfig): void {
  fs.writeFileSync(
    path.join(app.root, name),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function writeTsconfig(paths: Record<string, string[]>): void {
  writeConfig("tsconfig.json", {
    ...TSCONFIG,
    compilerOptions: { ...TSCONFIG.compilerOptions, paths },
  });
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

function failedFiles(result: Awaited<ReturnType<typeof addBanner>>): string[] {
  return !result.ok && result.error.code === "typecheck_failed"
    ? result.error.diagnostics.map((diagnostic) => diagnostic.file)
    : [];
}

/**
 * The builder holds two parses of the app for the life of the process. A dependency upgrade and a
 * `tsconfig.json` edit change how TypeScript resolves the app's imports, which a refresh of the
 * parsed files cannot see. The next operation must typecheck with the new resolution, and an
 * operation after which nothing of the kind changed must keep both parses.
 */
describe("[unit] the install state or the tsconfig changed between two builder operations", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    writeLabelsVersion("v1", "draft");
    installLabels("v1");
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

  it("keeps both parses when neither changed", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await addBanner(), "AddBlock");
    const writable = getWritableProject();
    const indexed = indexedProject().project;

    expectOk(await addBanner(), "AddBlock with nothing installed");

    expect(getWritableProject()).to.equal(writable);
    expect(indexedProject().project).to.equal(indexed);
  });

  it("typechecks the next operation against a package an install retargeted", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await addBanner(), "AddBlock before the upgrade");
    const writable = getWritableProject();
    const indexed = indexedProject().project;

    writeLabelsVersion("v2", "published");
    installLabels("v2");
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([
      path.join(app.root, "src", "labels.ts"),
    ]);
    expect(getWritableProject()).to.not.equal(writable);
    expect(indexedProject().project).to.not.equal(indexed);
  });

  it("resolves a `paths` alias added to the tsconfig in the next operation", async function () {
    this.timeout(OP_TIMEOUT);
    installLabels("v1");
    app.write(
      "aliased.ts",
      `import { status } from "@labels";\n\nexport const shown = status;\n`,
    );
    expect(failedFiles(await addBanner())).to.deep.equal([
      path.join(app.root, "src", "aliased.ts"),
    ]);
    const indexed = indexedProject().project;

    writeTsconfig({ "@labels": ["./src/labels.ts"] });

    expectOk(await addBanner(), "AddBlock after the alias");
    expect(indexedProject().project).to.not.equal(indexed);
  });

  it("reads a config the tsconfig extends again once it changed", async function () {
    this.timeout(OP_TIMEOUT);
    writeConfig("tsconfig.base.json", {
      compilerOptions: { paths: { "@labels": ["./src/labels.ts"] } },
    });
    writeConfig("tsconfig.json", {
      ...TSCONFIG,
      extends: "./tsconfig.base.json",
    });
    expectOk(await addBanner(), "AddBlock with the alias in the base");

    writeConfig("tsconfig.base.json", {
      compilerOptions: { paths: { "@labels": ["./src/missing.ts"] } },
    });

    expect(failedFiles(await addBanner())).to.deep.equal([
      path.join(app.root, "src", "aliased.ts"),
    ]);
  });
});
