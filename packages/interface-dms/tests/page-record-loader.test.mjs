import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { DefaultLayout } from "../dist/base/layouts.js";
import {
  readPageRecord,
  withPageRecord,
} from "../dist/page/internal/page-record.js";

const LOADER_FILE = join(import.meta.dirname, "page-record-loader.fixture.ts");

const SITE_MODEL = `
import { BasicDataModel, GetModel, Table } from "@antelopejs/interface-database-decorators";
import { DefaultLayout } from "../dist/base/layouts";

class Site extends Table {
  declare address: string;
}

class SiteModel extends BasicDataModel(Site, "sites") {}
`;

/**
 * The type errors of a layout whose `record` is `loader`, compiled against
 * the published declarations.
 *
 * @param {string} loader
 * @returns {string[]}
 */
function loaderErrors(loader) {
  const source = `${SITE_MODEL}\nDefaultLayout({ record: ${loader} });\nvoid GetModel; void Site;\n`;
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const base = ts.createCompilerHost(options);
  /** @param {string} file */
  const isLoader = (file) => resolve(file) === LOADER_FILE;
  /** @type {ts.CompilerHost} */
  const host = {
    ...base,
    fileExists: (file) => isLoader(file) || base.fileExists(file),
    readFile: (file) => (isLoader(file) ? source : base.readFile(file)),
    getSourceFile: (file, language, ...rest) =>
      isLoader(file)
        ? ts.createSourceFile(file, source, language)
        : base.getSourceFile(file, language, ...rest),
  };
  const program = ts.createProgram([LOADER_FILE], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(LOADER_FILE))
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

await test("the loader the TSDoc shows compiles: a model's get answers a PromiseLike of a row", () => {
  assert.deepEqual(
    loaderErrors(`({ params }) => GetModel(SiteModel).get(params?.id ?? "")`),
    [],
  );
});

await test("a loader may answer a model row synchronously", () => {
  assert.deepEqual(loaderErrors(`() => new Site()`), []);
});

await test("the loaders the earlier type accepted still compile", () => {
  for (const loader of [
    `(): Record<string, unknown> => ({ address: "1 Main St" })`,
    `async (): Promise<Record<string, unknown> | undefined> => undefined`,
    `async ({ params }) => { const site = await GetModel(SiteModel).get(params?.id ?? ""); return site && { ...site }; }`,
  ]) {
    assert.deepEqual(loaderErrors(loader), [], loader);
  }
});

await test("a loader answering something other than a record does not compile", () => {
  for (const loader of [`() => "site-1"`, `async () => "site-1"`]) {
    assert.notDeepEqual(loaderErrors(loader), [], loader);
  }
});

await test("a loader answering something other than an object finds no record", async () => {
  for (const answer of [undefined, null, "site-1", true]) {
    const layout = DefaultLayout({ record: async () => answer });
    assert.deepEqual(await readPageRecord(layout, {}), { status: "missing" });
  }
});

await test("a model row the loader resolves is found, and fills the record tokens of a header button", async () => {
  class Site {
    /** @param {string} address */
    constructor(address) {
      this.address = address;
    }
  }
  const layout = DefaultLayout({
    record: async () => new Site("1 Main St"),
  });
  const read = await readPageRecord(layout, {});
  assert.equal(read?.status, "found");
  const button = {
    id: "directions",
    label: "Directions",
    target: {
      type: "external",
      url: "https://maps.test/?q={{record.address}}",
    },
  };
  assert.equal(
    withPageRecord(button, true, read.record)?.target.url,
    "https://maps.test/?q=1%20Main%20St",
  );
});
