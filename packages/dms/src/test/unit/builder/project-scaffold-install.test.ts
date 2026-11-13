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

const NAMES = [
  ...Object.keys(BUILDER_CODE_INTERFACES),
  "typescript",
  "rimraf",
  "@types/node",
];

let root: string;

function vendorPackage(name: string): string {
  const folder = path.join("vendor", name.replace("/", "__"));
  fs.mkdirSync(path.join(root, folder), { recursive: true });
  fs.writeFileSync(
    path.join(root, folder, "package.json"),
    JSON.stringify({ name, version: "0.0.0-local" }),
  );
  return `file:${folder.split(path.sep).join("/")}`;
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

describe("scaffolding a module from a project with relative file: dependencies", () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-scaffold-"));
    setBuilderConfig({ projectRoot: root });
    const dependencies = Object.fromEntries(
      NAMES.map((name) => [name, vendorPackage(name)]),
    );
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "project", dependencies }),
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
