import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import {
  dmsDatabaseId,
  StepRefusal,
} from "../../../implementations/dms-builder/engine";

const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";

function config(modules: string): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "detection",
  modules: {
    mongodb: { source: { type: "package", package: "@antelopejs/mongodb", version: "*" } },
${modules}
  },
});
`;
}

let root: string;

function writeConfig(modules: string): void {
  fs.writeFileSync(path.join(root, "antelope.config.ts"), config(modules));
}

function writeManifest(folder: string, name: string): void {
  fs.mkdirSync(path.join(root, folder), { recursive: true });
  fs.writeFileSync(
    path.join(root, folder, "package.json"),
    JSON.stringify({ name }),
  );
}

/**
 * dms-database lists the connections registered on its own entry, so the builder has to find that
 * entry however the project keyed it: by the module's id, by the package it installs, or by the
 * name of a local checkout.
 */
describe("the entry that is dms-database", () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-dms-database-"));
    setBuilderConfig({ projectRoot: root });
  });

  after(() => {
    setBuilderConfig(undefined);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("is the module with the id dms-database", () => {
    writeConfig(
      `    "dms-database": { source: { type: "package", package: "x", version: "*" } },`,
    );
    expect(dmsDatabaseId()).to.equal("dms-database");
  });

  it("is found by the package its source installs, under any id", () => {
    writeConfig(
      `    "@antelopejs/dms-database": { source: { type: "package", package: "${DMS_DATABASE_PACKAGE}", version: "*" } },`,
    );
    expect(dmsDatabaseId()).to.equal("@antelopejs/dms-database");
  });

  it("is found by the name in the package.json of its local source", () => {
    writeManifest("vendor/console", DMS_DATABASE_PACKAGE);
    writeConfig(
      `    console: { source: { type: "local", path: "vendor/console" } },`,
    );
    expect(dmsDatabaseId()).to.equal("console");
  });

  it("is not a local module only because its folder is named after dms-database", () => {
    writeManifest("vendor/dms-database", "@acme/console");
    writeConfig(
      `    console: { source: { type: "local", path: "vendor/dms-database" } },`,
    );
    expect(dmsDatabaseId()).to.equal(undefined);
  });

  it("is not a local module whose folder has no package.json", () => {
    writeConfig(
      `    console: { source: { type: "local", path: "vendor/missing" } },`,
    );
    expect(dmsDatabaseId()).to.equal(undefined);
  });

  it("is nothing when the project has no dms-database", () => {
    writeConfig(`    app: { source: { type: "local", path: "." } },`);
    expect(dmsDatabaseId()).to.equal(undefined);
  });

  it("is refused by name when it is written as a version string, a constant or with a spread", () => {
    for (const [key, written] of [
      ["@antelopejs/dms-database", '"^0.3.0"'],
      ["dms-database", '"^0.3.0"'],
      ["dms-database", "DMS_DATABASE_ENTRY"],
      [
        "dms-database",
        '{ ...DEFAULTS, source: { type: "package", package: "x", version: "*" } }',
      ],
    ]) {
      writeConfig(`    "${key}": ${written},`);
      expect(() => dmsDatabaseId(), `${key}: ${written}`).to.throw(
        StepRefusal,
        new RegExp(`module "${key}" is not written as an object literal`),
      );
    }
  });

  it("is refused when a module is keyed by a computed name, a method or an accessor, and none is found", () => {
    for (const member of [
      `[DMS_KEY]: { source: { type: "package", package: "${DMS_DATABASE_PACKAGE}", version: "*" } },`,
      "console() { return {}; },",
      "get console() { return {}; },",
    ]) {
      writeConfig(`    ${member}`);
      expect(() => dmsDatabaseId(), member).to.throw(
        StepRefusal,
        /computed name, a method or an accessor/,
      );
    }
  });

  it("is the entry written as a literal, whatever a computed name beside it holds", () => {
    writeConfig(
      `    "dms-database": { source: { type: "package", package: "x", version: "*" } },
    [OTHER_KEY]: { source: { type: "package", package: "y", version: "*" } },`,
    );
    expect(dmsDatabaseId()).to.equal("dms-database");
  });

  it("is not refused for another module written as a version string", () => {
    writeConfig(`    "@antelopejs/some-app": "^1.0.0",`);
    expect(dmsDatabaseId()).to.equal(undefined);
  });

  it("is the entry written as a literal, whatever another key of it holds", () => {
    writeConfig(
      `    "dms-database": { source: { type: "package", package: "x", version: "*" } },
    "@antelopejs/dms-database": "^0.3.0",`,
    );
    expect(dmsDatabaseId()).to.equal("dms-database");
  });
});
