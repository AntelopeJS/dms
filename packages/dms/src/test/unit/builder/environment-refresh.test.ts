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

function nodeModules(root: string, ...segments: string[]): string {
  return path.join(root, "node_modules", ...segments);
}

/** A version of the `fixture-labels` package under its own folder, whose `label` accepts one value. */
function writeLabelsVersion(
  root: string,
  version: string,
  accepted: string,
): void {
  fs.mkdirSync(nodeModules(root, "fixture-labels", version), {
    recursive: true,
  });
  fs.writeFileSync(
    nodeModules(root, "fixture-labels", version, "index.d.ts"),
    `export declare function label(value: "${accepted}"): string;\n`,
  );
}

/**
 * Point `fixture-labels` at one version, as an upgrade relinks a package, and record the
 * install as pnpm does. The old version's files stay on disk.
 */
function installLabels(root: string, version: string): void {
  fs.writeFileSync(
    nodeModules(root, "fixture-labels", "package.json"),
    JSON.stringify({
      name: "fixture-labels",
      types: `${version}/index.d.ts`,
    }),
  );
  fs.writeFileSync(
    nodeModules(root, ".modules.yaml"),
    `layoutVersion: ${version}\n`,
  );
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
    ? result.error.diagnostics.map((diagnostic) =>
        path.normalize(diagnostic.file),
      )
    : [];
}

describe("[unit] the install state or the tsconfig changed between two builder operations: the next operation typechecks with the new resolution, and one after which nothing of the kind changed keeps both parses of the app", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    writeLabelsVersion(app.root, "v1", "draft");
    installLabels(app.root, "v1");
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

  it("keeps both parses when an install rewrote its state with the same content", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await addBanner(), "AddBlock");
    const writable = getWritableProject();
    const indexed = indexedProject().project;

    installLabels(app.root, "v1");
    const later = Date.now() / 1000 + 10;
    fs.utimesSync(nodeModules(app.root, ".modules.yaml"), later, later);
    expectOk(await addBanner(), "AddBlock after a no-op install");

    expect(getWritableProject()).to.equal(writable);
    expect(indexedProject().project).to.equal(indexed);
  });

  it("typechecks the next operation against a package an install retargeted", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await addBanner(), "AddBlock before the upgrade");
    const writable = getWritableProject();
    const indexed = indexedProject().project;

    writeLabelsVersion(app.root, "v2", "published");
    installLabels(app.root, "v2");
    expect(getWritableProject()).to.equal(writable);
    const result = await addBanner();

    expect(failedFiles(result)).to.deep.equal([
      path.join(app.root, "src", "labels.ts"),
    ]);
    expect(getWritableProject()).to.not.equal(writable);
    expect(indexedProject().project).to.not.equal(indexed);
  });

  it("resolves a `paths` alias added to the tsconfig in the next operation", async function () {
    this.timeout(OP_TIMEOUT);
    installLabels(app.root, "v1");
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

  it("reads the install state of a module added to the project configuration by hand", async function () {
    this.timeout(OP_TIMEOUT);
    writeConfig("tsconfig.base.json", {
      compilerOptions: { paths: { "@labels": ["./src/labels.ts"] } },
    });
    expectOk(await addBanner(), "AddBlock before the module");
    const extra = path.join(app.root, "modules", "extra");
    writeLabelsVersion(extra, "v1", "draft");
    installLabels(extra, "v1");
    fs.mkdirSync(path.join(extra, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(extra, "src", "index.ts"),
      `import { label } from "fixture-labels";\n\nexport const extra = label("draft");\n`,
    );
    fs.writeFileSync(
      path.join(app.root, "antelope.config.ts"),
      `export default {\n  name: "fixture",\n  modules: {\n    app: { source: { type: "local", path: "." } },\n    extra: { source: { type: "local", path: "modules/extra" } },\n  },\n};\n`,
    );
    expectOk(await addBanner(), "AddBlock with the module added");

    writeLabelsVersion(extra, "v2", "published");
    installLabels(extra, "v2");

    expect(failedFiles(await addBanner())).to.deep.equal([
      path.join(extra, "src", "index.ts"),
    ]);
  });
});
