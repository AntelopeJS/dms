const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, relative } = require("node:path");

const { argv, execPath } = process;

function optionValue(prefix) {
  return argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

const root = argv[2] ?? process.cwd();
const baseline = argv[3]?.startsWith("--") ? undefined : argv[3];
const baselineHelper = optionValue("--baseline-helper=");
const baselineRules = optionValue("--baseline-rules=");
const expectRejections = argv.includes("--expect-rejections");
const source = join(root, "packages/dms/src");
const typeCheckTarget = join(
  root,
  "packages/interface-dms/dist/utils/internal/type-check.js",
);

function runGuard(env = process.env) {
  return spawnSync(
    execPath,
    baseline
      ? [
          "-e",
          `
    const Module = require("node:module");
    const filename = require("node:path").resolve("packages/dms/scripts/backend-checks.cjs");
    const guard = new Module(filename);
    guard.filename = filename;
    guard.paths = Module._nodeModulePaths(require("node:path").dirname(filename));
    const helper = ${JSON.stringify(baselineHelper ?? null)};
    if (helper) {
      const helperFilename = require("node:path").join(require("node:path").dirname(filename), "backend-import-target.cjs");
      const original = new Module(helperFilename);
      original.filename = helperFilename;
      original.paths = guard.paths;
      original._compile(require("node:fs").readFileSync(helper, "utf8"), helperFilename);
      guard.require = function(request) {
        return request === "./backend-import-target.cjs" ? original.exports : Module.prototype.require.call(this, request);
      };
    }
    guard._compile(require("node:fs").readFileSync(${JSON.stringify(baseline)}, "utf8"), filename);
  `,
        ]
      : ["packages/dms/scripts/backend-checks.cjs"],
    { cwd: root, encoding: "utf8", env },
  );
}

function specifier(from, to) {
  const value = relative(dirname(from), to)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  return value.startsWith(".") ? value : `./${value}`;
}

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function loadTypescript() {
  return require(require.resolve("typescript", { paths: [root] }));
}

function dependencyViolations() {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "depcruise",
      "packages",
      "--config",
      ".dependency-cruiser.cjs",
      "--output-type",
      "json",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).summary.violations;
}

module.exports = {
  baseline,
  baselineRules,
  dependencyViolations,
  dirname,
  execPath,
  expectRejections,
  join,
  loadTypescript,
  makeTempDir,
  relative,
  root,
  runGuard,
  source,
  spawnSync,
  specifier,
  typeCheckTarget,
};
