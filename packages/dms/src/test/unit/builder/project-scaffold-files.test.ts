import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import ts from "typescript";
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

/**
 * What `tsc` reports and writes for a scaffolded module, built in memory from its files, the
 * `sources` written beside its entry and the `@types/node` its install brings.
 */
function build(
  files: Record<string, string>,
  sources: Record<string, string> = {},
) {
  const scaffold = scaffoldWith(files);
  for (const [file, text] of [
    ...scaffold.files,
    [scaffold.entryFile, scaffold.entryText],
    ...Object.entries(sources).map(([name, source]) => [
      path.join(scaffold.root, "src", name),
      source,
    ]),
  ]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const types = path.join(scaffold.root, "node_modules", "@types");
  fs.mkdirSync(types, { recursive: true });
  fs.symlinkSync(
    path.join(process.cwd(), "node_modules", "@types", "node"),
    path.join(types, "node"),
  );
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(scaffold.root, "tsconfig.json"),
    undefined,
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  expect(config?.errors).to.deep.equal([]);
  const program = ts.createProgram(
    config?.fileNames ?? [],
    config?.options ?? {},
  );
  const written = new Map<string, string>();
  const emit = program.emit(undefined, (file, text) =>
    written.set(path.resolve(file), text),
  );
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...emit.diagnostics,
  ];
  return {
    errors: diagnostics.map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, " "),
    ),
    entry: written.get(path.join(scaffold.root, "dist", "index.js")),
    outsideDist: [...written.keys()].filter(
      (file) => !file.startsWith(path.join(scaffold.root, "dist") + path.sep),
    ),
  };
}

function fileOf(files: Record<string, string>, name: string): string {
  const scaffold = scaffoldWith(files);
  const text = scaffold.files.get(path.join(scaffold.root, name));
  expect(text).to.be.a("string");
  return String(text);
}

/** Gives the tests of a suite a fresh project folder of their own. */
function inProjectRoot(): void {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-scaffold-"));
    setBuilderConfig({ projectRoot: root });
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    setBuilderConfig({});
  });
}

describe("scaffolding a module from project files npm, pnpm and tsc accept", () => {
  inProjectRoot();

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
      expect(text).to.contain('"typescript": "^6.0.3"');
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

  for (const spec of ["file:~/lib", "file:/opt/lib", "^1.0.0"]) {
    it(`keeps the project's ${spec} spec, which names its target from any folder`, () => {
      const text = fileOf(
        {
          "package.json": `{"dependencies": {"@antelopejs/interface-api": "${spec}"}}`,
        },
        "package.json",
      );
      expect(text).to.contain(`"@antelopejs/interface-api": "${spec}"`);
    });
  }

  it("rebases a relative spec whose folder name starts with ~", () => {
    const text = fileOf(
      {
        "package.json": `{"dependencies": {"@antelopejs/interface-api": "file:~vendor/api"}}`,
      },
      "package.json",
    );
    expect(text).to.contain(
      `"@antelopejs/interface-api": "file:../../~vendor/api"`,
    );
  });

  it("refuses a dependency whose range is not a string", () => {
    expect(() =>
      scaffoldWith({ "package.json": '{"dependencies": {"a": null}}' }),
    ).to.throw("package.json cannot be read");
  });
});

describe("building a module scaffolded from the project's tsconfig", () => {
  inProjectRoot();

  for (const value of ["null", "[]"]) {
    it(`builds the module of a project whose compilerOptions is ${value}`, function () {
      this.timeout(30_000);
      const { errors, entry } = build({
        "tsconfig.json": `{"compilerOptions": ${value}}`,
      });
      expect(errors).to.deep.equal([]);
      expect(entry).to.match(/^exports\.construct = construct;$/m);
    });
  }

  it("builds the module without the types, type roots, paths and files only the project has", function () {
    this.timeout(30_000);
    const { errors, entry } = build({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          types: ["vite/client"],
          typeRoots: ["./types"],
          baseUrl: ".",
          paths: { "~/*": ["./app/*"] },
          ignoreDeprecations: "6.0",
        },
        files: ["app.ts"],
      }),
    });
    expect(errors).to.deep.equal([]);
    expect(entry).to.match(/^exports\.construct = construct;$/m);
  });

  it("builds the module's sources though the project excludes its folder", function () {
    this.timeout(30_000);
    const { errors, entry } = build({
      "tsconfig.json": JSON.stringify({ exclude: ["modules"] }),
    });
    expect(errors).to.deep.equal([]);
    expect(entry).to.match(/^exports\.construct = construct;$/m);
  });

  it("writes the module's declarations in its dist though the project sets declarationDir", function () {
    this.timeout(30_000);
    const { errors, outsideDist } = build({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { declaration: true, declarationDir: "types" },
      }),
    });
    expect(errors).to.deep.equal([]);
    expect(outsideDist).to.deep.equal([]);
  });

  it("builds module code that needs an option the project's base tsconfig sets", function () {
    this.timeout(30_000);
    const { errors } = build(
      {
        "tsconfig.base.json": JSON.stringify({
          compilerOptions: { experimentalDecorators: true },
        }),
        "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
      },
      {
        "decorated.ts":
          "function inject(_target: object, _key: string | undefined, _index: number): void {}\n\nexport class Service {\n  constructor(@inject readonly port: number) {}\n}\n",
      },
    );
    expect(errors).to.deep.equal([]);
  });

  it("builds the module to CommonJS in dist from a typecheck-only project", function () {
    this.timeout(30_000);
    const { errors, entry } = build({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          noEmit: true,
          emitDeclarationOnly: true,
          declaration: true,
          outFile: "out.js",
          module: "preserve",
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          strict: true,
        },
      }),
    });
    expect(errors).to.deep.equal([]);
    expect(entry).to.match(/^exports\.construct = construct;$/m);
  });
});
