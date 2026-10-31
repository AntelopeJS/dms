const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const { argv, execPath } = process;

/**
 * @param {string} prefix
 * @returns {string | undefined}
 */
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
const source = path.join(root, "packages/dms/src");
const typeCheckTarget = path.join(
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

/**
 * @param {string} from
 * @param {string} to
 */
function specifier(from, to) {
  const value = path.relative(path.dirname(from), to)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  return value.startsWith(".") ? value : `./${value}`;
}

/**
 * @param {string} prefix
 */
function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/**
 * The one place the probes read the checkout's TypeScript, typed by the declaration it ships.
 * @returns {typeof import("../../../packages/interface-dms/node_modules/typescript")}
 */
function loadTypescript() {
  return require(require.resolve("typescript", { paths: [root] }));
}

/**
 * The one place the probes decode a dependency-cruiser JSON report, typed by the declaration the tool ships.
 * @param {string} text
 * @returns {import("../../../node_modules/dependency-cruiser").ICruiseResult}
 */
function parseCruiseResult(text) {
  return JSON.parse(text);
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
  return parseCruiseResult(result.stdout).summary.violations;
}

module.exports = {
  baseline,
  baselineRules,
  dependencyViolations,
  dirname: (/** @type {string} */ value) => path.dirname(value),
  execPath,
  expectRejections,
  join: (/** @type {string[]} */ ...segments) => path.join(...segments),
  loadTypescript,
  makeTempDir,
  parseCruiseResult,
  relative: (/** @type {string} */ from, /** @type {string} */ to) => path.relative(from, to),
  root,
  runGuard,
  source,
  spawnSync,
  specifier,
  typeCheckTarget,
};
