const assert = require("node:assert/strict");
const { unlinkSync, writeFileSync } = require("node:fs");
const {
  baseline,
  join,
  loadTypescript,
  root,
  runGuard,
  source,
} = require("./context.cjs");
const { adversarialImports } = require("./import-forms.cjs");
const {
  formerlyComputedControls,
  policyControls,
  policyFailures,
  sourceControls,
  sourceFailures,
} = require("./policy-forms.cjs");

/**
 * @param {ReturnType<typeof loadTypescript>} ts
 * @param {string} folder
 * @param {string} input
 */
function emitPolicy(ts, folder, input) {
  return folder === "src"
    ? input
    : ts.transpileModule(input, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText;
}

/**
 * @param {ReturnType<typeof loadTypescript>} ts
 * @param {string} folder
 */
function policyFolder(ts, folder) {
  const path = join(
    root,
    "packages/dms",
    folder,
    "utils",
    `__policy_probe_${process.pid}.${folder === "src" ? "ts" : "js"}`,
  );
  writeFileSync(path, "", { flag: "wx" });
  try {
    const erasedAssertion = `void (require as NodeRequire)("./index");`;
    const failures = [
      ...(folder === "dist" ? adversarialImports : []),
      ...policyFailures,
      ...formerlyComputedControls.filter(
        (input) => folder === "src" || input !== erasedAssertion,
      ),
    ];
    const controls = [
      ...policyControls,
      ...(folder === "dist" ? [erasedAssertion] : []),
    ];
    for (const input of failures) {
      writeFileSync(path, emitPolicy(ts, folder, input));
      const result = runGuard();
      assert.equal(result.status, 1, `${folder}: ${input}\n${result.stderr}`);
      assert.match(
        result.stderr,
        /relative imports must resolve inside backend|plain string literal|indirect require|computed loader|indirect loader|loader construction|imports must use another package specifier|module|process/,
      );
    }
    for (const input of controls) {
      writeFileSync(path, emitPolicy(ts, folder, input));
      const result = runGuard();
      assert.equal(result.status, 0, `${folder}: ${input}\n${result.stderr}`);
    }
    process.stdout.write(
      `${folder} literal-only policy: ${failures.length} forbidden forms rejected; ${controls.length} package/internal controls accepted.\n`,
    );
  } finally {
    unlinkSync(path);
  }
}

function literalPolicy() {
  if (baseline) return;
  const ts = loadTypescript();
  for (const folder of ["src", "dist"]) policyFolder(ts, folder);
}

/** @param {string} extension */
function sourceExtensionPolicy(extension) {
  const file = join(
    source,
    "utils",
    `__source_policy_probe_${process.pid}.${extension}`,
  );
  writeFileSync(file, "", { flag: "wx" });
  try {
    const healthy = runGuard();
    assert.equal(healthy.status, 0, healthy.stderr);
    for (const body of sourceFailures) {
      writeFileSync(file, body);
      const result = runGuard();
      assert.equal(result.status, 1, `${extension}: ${body}\n${result.stderr}`);
      assert.ok(result.stderr.includes(file), result.stderr);
      assert.match(
        result.stderr,
        /module|exports|process|constructor|loader|import/i,
      );
    }
    for (const body of sourceControls) {
      writeFileSync(file, body);
      const result = runGuard();
      assert.equal(result.status, 0, `${extension}: ${body}\n${result.stderr}`);
    }
    process.stdout.write(
      `Source-only capability policy (${extension}): ${sourceFailures.length} restrictions rejected (including four verifier regressions); ${sourceControls.length} ordinary controls and existing exact exemptions accepted.\n`,
    );
  } finally {
    unlinkSync(file);
  }
}

function builtOutputControls() {
  const ts = loadTypescript();
  const builtControls = [
    ts.transpileModule(
      `export const value = 1; export function read() { return value; }`,
      {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    `void module.id; void exports.value; void process.version; void Object.constructor;`,
    `import Loader from 'node:module'; void Loader;`,
    `import * as VM from 'node:vm'; void VM;`,
  ];
  const file = join(
    root,
    "packages/dms/dist/utils",
    `__source_policy_control_${process.pid}.js`,
  );
  writeFileSync(file, "", { flag: "wx" });
  try {
    for (const body of builtControls) {
      writeFileSync(file, body);
      const result = runGuard();
      assert.equal(
        result.status,
        0,
        `Built policy must remain unchanged: ${body}\n${result.stderr}`,
      );
    }
  } finally {
    unlinkSync(file);
  }
  process.stdout.write(
    `Built-output controls: ${builtControls.length} accepted, including compiler-generated CommonJS export plumbing.\n`,
  );
}

function sourcePolicy() {
  if (baseline) return;
  for (const extension of ["ts", "mts", "cts"])
    sourceExtensionPolicy(extension);
  builtOutputControls();
}

module.exports = { literalPolicy, sourcePolicy };
