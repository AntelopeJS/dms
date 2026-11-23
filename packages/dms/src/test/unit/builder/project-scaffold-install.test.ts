import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import {
  builderCodeInterfaces,
  type Scaffold,
  scaffoldLocalModule,
} from "../../../implementations/dms-builder/engine";
import { runScript } from "./helpers/processes";

const INTERFACES = Object.keys(builderCodeInterfaces());
const TOOLING = ["rimraf", "@types/node"];
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

const BUILDER_TYPESCRIPT = /\n\s*"typescript": "[^"]*",/g;

/** The manifest without the builder's own TypeScript range, which an offline install cannot fetch. */
function withoutRegistryTypescript(text: string): string {
  expect(text.match(BUILDER_TYPESCRIPT)).to.have.length(1);
  return text.replace(BUILDER_TYPESCRIPT, "");
}

function writeScaffold(): Scaffold {
  const scaffold = scaffoldLocalModule("m", "modules/m");
  for (const [file, text] of [
    ...scaffold.files,
    [scaffold.entryFile, scaffold.entryText] as const,
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      path.basename(file) === "package.json"
        ? withoutRegistryTypescript(text)
        : text,
    );
  }
  return scaffold;
}

/** The scaffold's own install command, kept off the registry and on a store of the test's own. */
function install(scaffold: Scaffold, store: string) {
  return runScript(
    `${scaffold.source.installCommand[0]} --offline --store-dir "${store}"`,
    scaffold.root,
    path.dirname(process.execPath),
  );
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
    const scaffold = writeScaffold();
    const moduleRoot = scaffold.root;
    const installed = install(scaffold, path.join(root, "store"));
    expect(installed.status, installed.output).to.equal(0);
    const missing = NAMES.filter(
      (name) =>
        !fs.existsSync(
          path.join(moduleRoot, "node_modules", name, "package.json"),
        ),
    );
    expect(missing).to.deep.equal([]);
  });
});

/** The pnpm this repository's workspace pins: a nested `pnpm install` under it installs the whole workspace. */
const PACKAGE_MANAGER = "pnpm@10.34.9";

describe("scaffolding a module from a project inside a pnpm workspace", () => {
  const DMS_INTERFACE = "@antelopejs/interface-dms";
  let workspace: string;

  before(() => {
    workspace = fs.mkdtempSync(
      path.join(os.tmpdir(), "dms-builder-workspace-"),
    );
    root = path.join(workspace, "project");
    fs.mkdirSync(root);
    setBuilderConfig({ projectRoot: root });
    fs.writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify({
        name: "workspace",
        private: true,
        packageManager: PACKAGE_MANAGER,
      }),
    );
    fs.writeFileSync(
      path.join(workspace, "pnpm-workspace.yaml"),
      "packages:\n  - project\n  - interface\n",
    );
    fs.mkdirSync(path.join(workspace, "interface"));
    fs.writeFileSync(
      path.join(workspace, "interface", "package.json"),
      JSON.stringify({ name: DMS_INTERFACE, version: "0.0.0-workspace" }),
    );
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "project",
        packageManager: PACKAGE_MANAGER,
        dependencies: {
          ...vendorPackages(INTERFACES),
          [DMS_INTERFACE]: "workspace:*",
        },
        devDependencies: vendorPackages(TOOLING),
      }),
    );
    fs.writeFileSync(path.join(root, "tsconfig.json"), "{}");
    const project = runScript(
      `pnpm install --offline --store-dir "${path.join(workspace, "store")}"`,
      workspace,
      path.dirname(process.execPath),
    );
    expect(project.status, project.output).to.equal(0);
  });

  after(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    setBuilderConfig({});
  });

  it("installs the module in its own folder, linked to the workspace's copy of a workspace: dependency", () => {
    const scaffold = writeScaffold();
    const installed = install(scaffold, path.join(workspace, "store"));
    expect(installed.status, installed.output).to.equal(0);
    const missing = NAMES.filter(
      (name) =>
        !fs.existsSync(
          path.join(scaffold.root, "node_modules", name, "package.json"),
        ),
    );
    expect(missing).to.deep.equal([]);
    expect(
      fs.realpathSync.native(
        path.join(scaffold.root, "node_modules", DMS_INTERFACE),
      ),
    ).to.equal(fs.realpathSync.native(path.join(workspace, "interface")));
  });
});

describe("scaffolding a module from a project with a catalog: dependency", () => {
  const CORE_INTERFACE = "@antelopejs/interface-core";
  let workspace: string;

  before(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-catalog-"));
    root = path.join(workspace, "project");
    const copy = path.join(workspace, "store", "interface-core");
    fs.mkdirSync(copy, { recursive: true });
    fs.writeFileSync(
      path.join(copy, "package.json"),
      JSON.stringify({ name: CORE_INTERFACE, version: "0.0.0-catalog" }),
    );
    fs.mkdirSync(path.join(root, "node_modules", "@antelopejs"), {
      recursive: true,
    });
    fs.symlinkSync(
      copy,
      path.join(root, "node_modules", CORE_INTERFACE),
      "junction",
    );
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "project",
        dependencies: { [CORE_INTERFACE]: "catalog:" },
      }),
    );
    setBuilderConfig({ projectRoot: root });
  });

  after(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    setBuilderConfig({});
  });

  it("links the module to the copy the project resolves, which an install outside the workspace can reach", () => {
    const scaffold = scaffoldLocalModule("m", "modules/m");
    const manifest = scaffold.files.get(
      path.join(scaffold.root, "package.json"),
    );
    const spec: unknown = JSON.parse(manifest ?? "{}").dependencies?.[
      CORE_INTERFACE
    ];
    expect(spec).to.equal("link:../../../store/interface-core");
  });
});
