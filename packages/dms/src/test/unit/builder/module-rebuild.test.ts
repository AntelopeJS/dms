import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { ConfigureProject } from "../../../implementations/dms-builder";
import {
  invalidateResourceIndex,
  invalidateSourceIndex,
  resetWritableProject,
} from "../../../implementations/dms-builder/engine";
import { expectOk } from "./harness";
import { runScript } from "./helpers/processes";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const MODULE = "modules/builder-db-erp-tables";
const PACKAGE_ROOT = path.join(__dirname, "..", "..", "..", "..");

const CONFIG = `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({ name: "rebuild", modules: {} });
`;

const TEMPLATE_TSCONFIG = {
  compilerOptions: {
    moduleResolution: "bundler",
    module: "commonjs",
    target: "esnext",
    types: ["node"],
    outDir: "dist",
    rootDir: "src",
    incremental: true,
    tsBuildInfoFile: "dist/.tsbuildinfo",
  },
  include: ["src/**/*.ts"],
};

let root: string;
let ceiling: string | undefined;

/** Runs the module's own `build` script, as its `installCommand` does on every project restart. */
function build(): void {
  const script = /"build":\s*"([^"]+)"/.exec(
    projectFile(root, `${MODULE}/package.json`),
  )?.[1];
  expect(script, "the module's build script").to.be.a("string");
  const run = runScript(
    String(script),
    path.join(root, MODULE),
    path.join(PACKAGE_ROOT, "node_modules", ".bin"),
  );
  expect(run.status, `${script}: ${run.output}`).to.equal(0);
}

/**
 * A module the builder scaffolds into a project built the way the template is: incremental builds
 * with their state kept in `dist`. Every restart of the project builds each local module again,
 * so the module must leave its `dist` behind however many times that runs.
 */
describe("a module the builder scaffolds, restarted with its project", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-rebuild-"));
    fs.writeFileSync(path.join(root, "antelope.config.ts"), CONFIG);
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{ "name": "rebuild", "devDependencies": { "typescript": "^6.0.3" } }\n',
    );
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify(TEMPLATE_TSCONFIG),
    );
    ceiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(root);
    setBuilderConfig({ projectRoot: root });
    resetWritableProject();
    invalidateSourceIndex();
    invalidateResourceIndex();
    expectOk(
      await ConfigureProject([
        { op: "CreateLocalModule", id: "builder-db-erp-tables", path: MODULE },
      ]),
      "ConfigureProject",
    );
    fs.symlinkSync(
      path.join(PACKAGE_ROOT, "node_modules"),
      path.join(root, MODULE, "node_modules"),
    );
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (ceiling === undefined) {
      delete process.env.GIT_CEILING_DIRECTORIES;
    } else {
      process.env.GIT_CEILING_DIRECTORIES = ceiling;
    }
    resetWritableProject();
    setBuilderConfig({});
  });

  it("builds its entry the first time", () => {
    build();
    expect(fs.existsSync(path.join(root, MODULE, "dist", "index.js"))).to.equal(
      true,
    );
  });

  it("builds its entry again on the next restart", () => {
    build();
    expect(fs.existsSync(path.join(root, MODULE, "dist", "index.js"))).to.equal(
      true,
    );
  });
});
