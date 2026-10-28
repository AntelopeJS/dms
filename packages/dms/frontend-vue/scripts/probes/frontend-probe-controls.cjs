"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { captureProbe } = require("./capture-frontend-probe.cjs");

const root = path.resolve(process.argv[2]);
const frontend = path.join(root, "packages/dms/frontend-vue");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-controls-"));
const copy = path.join(temporary, "packages/dms/frontend-vue");
const probe = path.join(temporary, "captured-probe.cjs");
const run = () =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["--max-old-space-size=650", probe, temporary],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      },
    ),
  );
const entry = (result, name) =>
  result.autoImports.find((item) => item.name === name);

try {
  fs.mkdirSync(copy, { recursive: true });
  for (const file of [
    "layers",
    "package.json",
    "dms.frontend.ts",
    "dms.frontend.build.ts",
  ])
    fs.cpSync(path.join(frontend, file), path.join(copy, file), {
      recursive: true,
    });
  fs.symlinkSync(
    path.join(frontend, "node_modules"),
    path.join(copy, "node_modules"),
  );
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(temporary, "node_modules"),
  );
  fs.symlinkSync(
    path.join(root, "packages/interface-dms"),
    path.join(temporary, "packages/interface-dms"),
  );
  captureProbe(probe);
  const baseline = run();
  const bucket = path.join(
    copy,
    "layers/dms-ui/app/composables/chart/apexDatetimeBuckets.ts",
  );
  const originalBucket = fs.readFileSync(bucket, "utf8");
  const ts = createRequire(path.join(frontend, "package.json"))("typescript");
  const ast = ts.createSourceFile(
    bucket,
    originalBucket,
    ts.ScriptTarget.Latest,
    true,
  );
  let timestamp;
  const visit = (node) => {
    if (ts.isParameter(node) && node.name.getText(ast) === "timestamp")
      timestamp = node.type;
    ts.forEachChild(node, visit);
  };
  const formatter = ast.statements.find(
    (node) => node.name?.text === "bucketAxisFormatter",
  );
  visit(formatter);
  assert.ok(timestamp);
  const narrowed =
    originalBucket.slice(0, timestamp.getStart(ast)) +
    "number" +
    originalBucket.slice(timestamp.end);
  assert.notEqual(
    narrowed,
    originalBucket,
    "The baseline bucket callback must accept unknown",
  );
  fs.writeFileSync(bucket, narrowed);
  const narrowResult = run();
  assert.notDeepEqual(
    entry(narrowResult, "bucketAxisFormatter"),
    entry(baseline, "bucketAxisFormatter"),
  );
  assert.match(
    entry(narrowResult, "bucketAxisFormatter").signature,
    /timestamp\?: number/,
  );
  fs.writeFileSync(bucket, originalBucket);

  const extra = path.join(
    copy,
    "layers/dms-ui/app/composables/internal/probeExtraAutoImport.ts",
  );
  fs.mkdirSync(path.dirname(extra), { recursive: true });
  fs.writeFileSync(
    extra,
    "/** @internal */\nexport function probeExtraAutoImport(value: unknown): unknown { return value; }\n",
  );
  const extraResult = run();
  assert.equal(entry(baseline, "probeExtraAutoImport"), undefined);
  assert.equal(entry(extraResult, "probeExtraAutoImport").injected, true);
  assert.match(
    entry(extraResult, "probeExtraAutoImport").signature,
    /value: unknown/,
  );
  fs.rmSync(extra);

  const register = path.join(copy, "layers/dms-ui/app/plugins/register.ts");
  const originalRegister = fs.readFileSync(register, "utf8");
  const reordered = originalRegister
    .replace("  registerBlockFunctions();\n", "")
    .replace(
      "  registerDefaultDataTypes();",
      "  registerBlockFunctions();\n  registerDefaultDataTypes();",
    );
  assert.notEqual(reordered, originalRegister);
  fs.writeFileSync(register, reordered);
  const reorderResult = run();
  assert.equal(
    reorderResult.registrations.length,
    baseline.registrations.length,
  );
  assert.notDeepEqual(reorderResult.registrations, baseline.registrations);
  const firstDifference = baseline.registrations.findIndex(
    (event, index) =>
      JSON.stringify(event) !==
      JSON.stringify(reorderResult.registrations[index]),
  );
  fs.writeFileSync(register, originalRegister);

  fs.writeFileSync(
    extra,
    'export const probePropertyOrder: { first: string; second: number } = { first: "", second: 0 };\n',
  );
  const propertyOrder = entry(run(), "probePropertyOrder");
  fs.writeFileSync(
    extra,
    'export const probePropertyOrder: { second: number; first: string } = { first: "", second: 0 };\n',
  );
  assert.deepEqual(entry(run(), "probePropertyOrder"), propertyOrder);
  fs.writeFileSync(
    extra,
    'export const probePropertyOrder: { second: string; first: string } = { first: "", second: "" };\n',
  );
  assert.notDeepEqual(entry(run(), "probePropertyOrder"), propertyOrder);

  fs.writeFileSync(
    extra,
    "export function probeExtraAutoImport(value: unknown): Record<string, unknown> { return {}; }\n",
  );
  const explicit = run();
  const owner = path.join(copy, "layers/dms-ui/app/build/probeTypeOwner.ts");
  fs.writeFileSync(
    owner,
    "export function probeTypeOwner(value: unknown): Record<string, unknown> { return {}; }\n",
  );
  fs.writeFileSync(
    extra,
    "import { probeTypeOwner } from '../../build/probeTypeOwner';\nexport function probeExtraAutoImport(value: Parameters<typeof probeTypeOwner>[0]): ReturnType<typeof probeTypeOwner> { return {}; }\n",
  );
  const derived = run();
  assert.deepEqual(
    entry(explicit, "probeExtraAutoImport"),
    entry(derived, "probeExtraAutoImport"),
  );
  const runtimeFile = path.join(copy, "dms.frontend.ts");
  const runtimeSource = fs.readFileSync(runtimeFile, "utf8");
  const runtimeAst = ts.createSourceFile(
    runtimeFile,
    runtimeSource,
    ts.ScriptTarget.Latest,
    true,
  );
  const components = runtimeAst.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations[0].name.getText(runtimeAst) ===
        "components",
  );
  const initializer = components?.declarationList.declarations[0].initializer;
  if (initializer?.getText(runtimeAst).includes("import.meta.glob")) {
    const entryFile = path.join(
      copy,
      "layers/dms-ui/app/entries/probe-components.ts",
    );
    const prefix = `${path.relative(path.dirname(entryFile), copy)}/`;
    const expression = initializer
      .getText(runtimeAst)
      .replaceAll("./layers/", `${prefix}layers/`);
    const references = new Set();
    const collectReferences = (node) => {
      if (ts.isIdentifier(node)) references.add(node.text);
      ts.forEachChild(node, collectReferences);
    };
    collectReferences(initializer);
    const imports = runtimeAst.statements
      .filter((node) => {
        if (!ts.isImportDeclaration(node) || !node.importClause) return false;
        const { name, namedBindings } = node.importClause;
        const bindings = namedBindings
          ? ts.isNamedImports(namedBindings)
            ? namedBindings.elements.map((binding) => binding.name)
            : [namedBindings.name]
          : [];
        return [name, ...bindings].some(
          (binding) => binding && references.has(binding.text),
        );
      })
      .map((node) =>
        node.getText(runtimeAst).replaceAll("./layers/", `${prefix}layers/`),
      )
      .join("\n");
    fs.mkdirSync(path.dirname(entryFile), { recursive: true });
    fs.writeFileSync(
      entryFile,
      `${imports}\nconst local = ${expression};\nexport const components = Object.fromEntries(Object.entries(local).map(([name, loader]) => [name.replace(${JSON.stringify(prefix)}, './'), loader]));\n`,
    );
    fs.writeFileSync(
      runtimeFile,
      runtimeSource.slice(0, components.getStart(runtimeAst)) +
        "import { components } from './layers/dms-ui/app/entries/probe-components';" +
        runtimeSource.slice(components.end),
    );
    assert.deepEqual(run().registrations, baseline.registrations);
  } else {
    assert.match(runtimeSource, /entries/);
  }
  process.stdout.write(
    `${JSON.stringify({ autoImports: baseline.autoImports.length, registrations: baseline.registrations.length, bucketAxisFormatter: { before: entry(baseline, "bucketAxisFormatter").signature, after: entry(narrowResult, "bucketAxisFormatter").signature }, extraAutoImport: entry(extraResult, "probeExtraAutoImport"), registrationReorder: { firstDifference, before: baseline.registrations[firstDifference], after: reorderResult.registrations[firstDifference] }, ownerDerivedEquivalent: true, objectPropertyOrderEquivalent: true, objectPropertyTypeChangeDetected: true, capturedSingleFile: true, importedEntryMaps: true })}\n`,
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
