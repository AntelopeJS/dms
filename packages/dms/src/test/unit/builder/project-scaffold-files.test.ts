import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { scaffoldLocalModule } from "../../../implementations/dms-builder/engine";

let root: string;

function scaffoldWith(files: Record<string, string>) {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), text);
  }
  return scaffoldLocalModule("m", "modules/m");
}

function fileOf(files: Record<string, string>, name: string): string {
  const scaffold = scaffoldWith(files);
  const text = scaffold.files.get(path.join(scaffold.root, name));
  expect(text).to.be.a("string");
  return String(text);
}

describe("scaffolding a module from project files npm, pnpm and tsc accept", () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-scaffold-"));
    setBuilderConfig({ projectRoot: root });
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    setBuilderConfig({});
  });

  for (const field of ["dependencies", "devDependencies"]) {
    for (const value of ["null", "[]"]) {
      it(`reads ${field} ${value} as absent`, () => {
        const text = fileOf(
          { "package.json": `{"${field}": ${value}}` },
          "package.json",
        );
        expect(text).to.contain('"rimraf": "^6.1.3"');
      });
    }
  }

  for (const name of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
    it(`leaves a project dependency named ${name} out of the module's tooling`, () => {
      const text = fileOf(
        {
          "package.json": `{"dependencies": {"${name}": "^1.0.0", "typescript": "^5.0.0"}}`,
        },
        "package.json",
      );
      expect(text).to.contain('"typescript"');
      expect(text).not.to.contain(`"${name}"`);
    });
  }

  it("carries a null packageManager into the manifest as null", () => {
    const text = fileOf(
      { "package.json": '{"packageManager": null}' },
      "package.json",
    );
    expect(text).to.contain('"packageManager": null');
  });

  for (const value of ["null", "[]"]) {
    it(`reads compilerOptions ${value} as absent`, () => {
      const text = fileOf(
        { "tsconfig.json": `{"compilerOptions": ${value}}` },
        "tsconfig.json",
      );
      expect(text).to.equal(
        '{\n  "compilerOptions": {\n    "rootDir": "src",\n    "outDir": "dist",\n    "tsBuildInfoFile": "dist/.tsbuildinfo"\n  },\n  "include": [\n    "src/**/*.ts"\n  ]\n}\n',
      );
    });
  }

  it("refuses a dependency whose range is not a string", () => {
    expect(() =>
      scaffoldWith({ "package.json": '{"dependencies": {"a": null}}' }),
    ).to.throw("package.json cannot be read");
  });
});
