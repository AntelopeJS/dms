import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { TableViewSchema } from "../dist/base/table-view/schema.js";

const packageRoot = join(import.meta.dirname, "..");

const FIXTURE_FILE = join(packageRoot, "tests", "live-hold-fixture.ts");

const OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  experimentalDecorators: true,
  noEmit: true,
  skipLibCheck: true,
  types: ["node"],
};

/**
 * Compiles `source` as a module that sits in this package, so its import of
 * `@antelopejs/interface-dms/*` resolves through the package's own `exports`
 * onto `dist`.
 *
 * @param {string} source
 * @returns {number[]} The diagnostic codes of the fixture file
 */
function diagnosticCodes(source) {
  const host = ts.createCompilerHost(OPTIONS);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (file) => file === FIXTURE_FILE || fileExists(file);
  host.readFile = (file) => (file === FIXTURE_FILE ? source : readFile(file));
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === FIXTURE_FILE
      ? ts.createSourceFile(file, source, languageVersion)
      : getSourceFile(file, languageVersion, ...rest);
  const program = ts.createProgram([FIXTURE_FILE], OPTIONS, host);
  const fixture = program.getSourceFile(FIXTURE_FILE);
  assert.ok(fixture, "the fixture is part of the program");
  return ts
    .getPreEmitDiagnostics(program, fixture)
    .map((diagnostic) => diagnostic.code);
}

/**
 * A `TableView.fromSource` over a route, with `liveHold` set to `liveHold`.
 *
 * @param {string} liveHold
 * @returns {string}
 */
function sourceTable(liveHold) {
  return `
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { TableView } from "@antelopejs/interface-dms/base/table-view";

export const table = TableView.fromSource({
  columns: { id: { name: "Id", type: new DefaultDataTypes.StringType() } },
  fetchUrl: "/api/requests",
  realtimeTopic: "api:requests",
  liveHold: ${liveHold},
});
`;
}

/**
 * A `TableViewLiveHoldOptions` value.
 *
 * @param {string} hold
 * @returns {string}
 */
function holdOptions(hold) {
  return `
import type { TableViewLiveHoldOptions } from "@antelopejs/interface-dms/base/table-view/options";

export const hold: TableViewLiveHoldOptions = ${hold};
`;
}

const TS_NOT_ASSIGNABLE = 2322;
const TS_PROPERTY_MISSING = 2741;

await test("a source table with `liveHold: { whileOnScreen: false }` compiles", () => {
  assert.deepEqual(
    diagnosticCodes(sourceTable("{ whileOnScreen: false }")),
    [],
  );
});

await test("a source table with `whileOnScreen` and the other reasons compiles", () => {
  assert.deepEqual(
    diagnosticCodes(
      sourceTable(
        "{ whileOnScreen: false, whileRowOpen: true, whileScrolled: true }",
      ),
    ),
    [],
  );
});

await test("a `TableViewLiveHoldOptions` with `whileOnScreen: true` compiles", () => {
  assert.deepEqual(diagnosticCodes(holdOptions("{ whileOnScreen: true }")), []);
});

await test("`liveHold: true` on a source table is refused as not assignable", () => {
  assert.deepEqual(diagnosticCodes(sourceTable("true")), [TS_NOT_ASSIGNABLE]);
});

await test("`liveHold: false` on a source table is refused as not assignable", () => {
  assert.deepEqual(diagnosticCodes(sourceTable("false")), [TS_NOT_ASSIGNABLE]);
});

await test("a `liveHold` object that leaves out `whileOnScreen` is refused as missing it", () => {
  assert.deepEqual(
    diagnosticCodes(sourceTable("{ whileRowOpen: true, whileScrolled: true }")),
    [TS_PROPERTY_MISSING],
  );
});

await test("an empty `liveHold` object is refused as missing `whileOnScreen`", () => {
  assert.deepEqual(diagnosticCodes(holdOptions("{}")), [TS_PROPERTY_MISSING]);
});

await test("the table-view schema accepts a `liveHold` that names `whileOnScreen`", () => {
  const liveHold = TableViewSchema.shape.liveHold;
  assert.equal(liveHold.safeParse({ whileOnScreen: false }).success, true);
  assert.equal(
    liveHold.safeParse({
      whileOnScreen: true,
      whileSorted: true,
      missedLabel: "$api.live.new_requests",
    }).success,
    true,
  );
  assert.equal(liveHold.safeParse(undefined).success, true);
});

await test("the table-view schema refuses `true`, `false` and an object without `whileOnScreen`", () => {
  const liveHold = TableViewSchema.shape.liveHold;
  assert.equal(liveHold.safeParse(true).success, false);
  assert.equal(liveHold.safeParse(false).success, false);
  assert.equal(liveHold.safeParse({}).success, false);
  assert.equal(liveHold.safeParse({ whileRowOpen: true }).success, false);
});
