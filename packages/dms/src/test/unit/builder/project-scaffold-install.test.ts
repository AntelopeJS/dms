import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import {
  BUILDER_CODE_INTERFACES,
  scaffoldLocalModule,
} from "../../../implementations/dms-builder/engine";
import { runScript } from "./helpers/processes";

const INTERFACES = Object.keys(BUILDER_CODE_INTERFACES);
const TOOLING = ["typescript", "rimraf", "@types/node"];
const NAMES = [...INTERFACES, ...TOOLING];
const PREFIXES = ["file:", "link:", "./"];

let root: string;

function vendorPackage(name: string, protocol: string): string {
  const folder = path.join("vendor", name.replace("/", "__"));
  fs.mkdirSync(path.join(root, folder), { recursive: true });
  fs.writeFileSync(
    path.join(root, folder, "package.json"),
    JSON.stringify({ name, version: "0.0.0-local" }),
  );
  return `${protocol}${folder.split(path.sep).join("/")}`;
}

function vendorPackages(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      vendorPackage(name, PREFIXES[index % PREFIXES.length] ?? "file:"),
    ]),
  );
}

function writeScaffold(): string {
  const scaffold = scaffoldLocalModule("m", "modules/m");
  for (const [file, text] of [
    ...scaffold.files,
    [scaffold.entryFile, scaffold.entryText] as const,
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return scaffold.root;
}

describe("scaffolding a module from a project with relative path dependencies", () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-scaffold-"));
    setBuilderConfig({ projectRoot: root });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "project",
        dependencies: vendorPackages(INTERFACES),
        devDependencies: vendorPackages(TOOLING),
      }),
    );
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    setBuilderConfig({});
  });

  it("installs the module with each dependency resolved from the project's folder", () => {
    const moduleRoot = writeScaffold();
    const install = runScript(
      `pnpm install --offline --ignore-workspace --store-dir "${path.join(root, "store")}"`,
      moduleRoot,
      path.dirname(process.execPath),
    );
    expect(install.status, install.output).to.equal(0);
    const missing = NAMES.filter(
      (name) =>
        !fs.existsSync(
          path.join(moduleRoot, "node_modules", name, "package.json"),
        ),
    );
    expect(missing).to.deep.equal([]);
  });
});
