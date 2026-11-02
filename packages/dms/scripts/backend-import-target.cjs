const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, realpathSync } = require("node:fs");
const { createRequire, isBuiltin } = require("node:module");
const nodePath = require("node:path");
const { sep } = nodePath;
const { fileURLToPath, pathToFileURL } = require("node:url");
const ts = require("typescript");
const { optionalText, readJsonRecord } = require("./helpers/json-record.mjs");
const { forbidden } = require("../../../.dependency-cruiser/backend.cjs");

const root = nodePath.resolve(__dirname, "..");
const workspace = nodePath.resolve(root, "../..");
const processPins = {
  "src/dev/module-update-notifications.ts:1":
    'import { execFile } from "node:child_process";',
  "src/dev/module-update-notifications.ts:2":
    'import { promisify } from "node:util";',
  "src/dev/module-update-notifications.ts:38":
    "const execFileAsync = promisify(execFile);",
  "src/dev/module-update-notifications.ts:93":
    'const { stdout } = await execFileAsync(\n      "npm",\n      ["view", packageName, "version"],\n      { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS, signal },\n    );',
  "src/store/registry.ts:1": 'import { execFile } from "node:child_process";',
  "src/store/registry.ts:2": 'import { promisify } from "node:util";',
  "src/store/registry.ts:5": "const execFileAsync = promisify(execFile);",
  "src/store/registry.ts:39":
    'const { stdout } = await execFileAsync(\n      "npm",\n      ["view", spec, ...fields, "--json"],\n      { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS },\n    );',
  "src/store/tarball.ts:1": 'import { execFile } from "node:child_process";',
  "src/store/tarball.ts:5": 'import { promisify } from "node:util";',
  "src/store/tarball.ts:8": "const execFileAsync = promisify(execFile);",
  "src/store/tarball.ts:80":
    'await execFileAsync(\n    "npm",\n    ["pack", spec, "--pack-destination", destination, "--silent"],\n    { cwd: projectPath, timeout: NPM_PACK_TIMEOUT_MS },\n  );',
  "src/test/unit/package-contents.test.ts:1":
    'import { execFileSync } from "node:child_process";',
  "src/test/unit/package-contents.test.ts:42":
    'const output = execFileSync(\n    "npm",\n    ["pack", "--dry-run", "--json", "--ignore-scripts"],\n    {\n      cwd: PACKAGE_ROOT,\n      encoding: "utf8",\n      timeout: PACK_TIMEOUT_MS,\n\n      stdio: ["ignore", "pipe", "pipe"],\n    },\n  );',
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:1":
    'import { execFile } from "node:child_process";',
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:2":
    'import { resolve } from "node:path";',
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:3":
    'import { promisify } from "node:util";',
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:7":
    'const FIXTURE = resolve(__dirname, "table-view-evaluation-order.fixture.js");',
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:13":
    "const runProcess = promisify(execFile);",
  "src/test/unit/interfaces/dms-base/table-view-evaluation-order.test.ts:18":
    "const { stdout } = await runProcess(process.execPath, [FIXTURE]);",
  "dist/dev/module-update-notifications.js:8":
    'const node_child_process_1 = require("node:child_process");',
  "dist/dev/module-update-notifications.js:9":
    'const node_util_1 = require("node:util");',
  "dist/dev/module-update-notifications.js:25":
    "const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);",
  "dist/dev/module-update-notifications.js:65":
    'const { stdout } = await execFileAsync("npm", ["view", packageName, "version"], { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS, signal });',
  "dist/store/registry.js:6":
    'const node_child_process_1 = require("node:child_process");',
  "dist/store/registry.js:7": 'const node_util_1 = require("node:util");',
  "dist/store/registry.js:8":
    "const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);",
  "dist/store/registry.js:18":
    'const { stdout } = await execFileAsync("npm", ["view", spec, ...fields, "--json"], { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS });',
  "dist/store/tarball.js:8":
    'const node_child_process_1 = require("node:child_process");',
  "dist/store/tarball.js:12": 'const node_util_1 = require("node:util");',
  "dist/store/tarball.js:14":
    "const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);",
  "dist/store/tarball.js:58":
    'await execFileAsync("npm", ["pack", spec, "--pack-destination", destination, "--silent"], { cwd: projectPath, timeout: NPM_PACK_TIMEOUT_MS });',
  "dist/test/unit/package-contents.test.js:3":
    'const node_child_process_1 = require("node:child_process");',
  "dist/test/unit/package-contents.test.js:29":
    'const output = (0, node_child_process_1.execFileSync)("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {\n        cwd: PACKAGE_ROOT,\n        encoding: "utf8",\n        timeout: PACK_TIMEOUT_MS,\n        stdio: ["ignore", "pipe", "pipe"],\n    });',
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:3":
    'const node_child_process_1 = require("node:child_process");',
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:4":
    'const node_path_1 = require("node:path");',
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:5":
    'const node_util_1 = require("node:util");',
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:7":
    'const FIXTURE = (0, node_path_1.resolve)(__dirname, "table-view-evaluation-order.fixture.js");',
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:11":
    "const runProcess = (0, node_util_1.promisify)(node_child_process_1.execFile);",
  "dist/test/unit/interfaces/dms-base/table-view-evaluation-order.test.js:15":
    "const { stdout } = await runProcess(process.execPath, [FIXTURE]);",
};

/**
 * @param {ts.SourceFile} source
 * @param {string} path
 */
function checkCapabilities(source, path) {
  const file = nodePath.relative(root, path).split(sep).join("/");
  const pins = Object.keys(processPins).filter((key) =>
    key.startsWith(`${file}:`),
  );
  const used = new Set();
  const names = new Set([
    "execFile",
    "execFileSync",
    "execFileAsync",
    "runProcess",
    "FIXTURE",
    "node_child_process_1",
    "promisify",
    "node_util_1",
  ]);
  if (file.includes("table-view-evaluation-order.test.")) {
    names.add("resolve");
    names.add("node_path_1");
  }
  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
      assert.notEqual(
        node.text,
        "NODE_OPTIONS",
        `${path} NODE_OPTIONS loader configuration is forbidden`,
      );
      if (
        pins.length &&
        (names.has(node.text) ||
          ["child_process", "node:child_process"].includes(node.text))
      ) {
        let statement = node;
        while (
          statement.parent &&
          !ts.isSourceFile(statement.parent) &&
          !ts.isBlock(statement.parent)
        )
          statement = statement.parent;
        const line =
          source.getLineAndCharacterOfPosition(statement.getStart(source))
            .line + 1;
        const key = `${file}:${line}`;
        assert.equal(
          statement.getText(source),
          processPins[key],
          `${key} process instrumentation moved, changed or added`,
        );
        used.add(key);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(
    used.size,
    pins.length,
    `${path} every process instrumentation pin must remain used`,
  );
}

/**
 * @param {string} value
 * @param {string} importer
 * @param {boolean} esm
 * @returns {string}
 */
function resolveRuntime(value, importer, esm) {
  if (!esm) return createRequire(importer).resolve(value);
  const url = execFileSync(
    process.execPath,
    [
      "--experimental-import-meta-resolve",
      "--input-type=module",
      "-e",
      "process.stdout.write(import.meta.resolve(process.argv[1], process.argv[2]))",
      value,
      pathToFileURL(importer).href,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return fileURLToPath(url);
}

/**
 * @param {string} path
 * @returns {string}
 */
function policyPath(path) {
  const file = nodePath
    .relative(workspace, realpathSync(path))
    .split(sep)
    .join("/");
  return file.startsWith("packages/dms/dist/")
    ? file.replace("/dist/", "/src/").replace(/\.(c|m)?js$/, ".$1ts")
    : file;
}

/**
 * @param {string | string[]} pattern
 * @param {string} path
 * @returns {boolean}
 */
function matches(pattern, path) {
  return (Array.isArray(pattern) ? pattern : [pattern]).some((value) =>
    new RegExp(value).test(path),
  );
}

/**
 * @param {{ path?: string | string[], pathNot?: string | string[] }} selector
 * @param {string} path
 * @returns {boolean}
 */
function applies(selector, path) {
  return (
    (!selector.path || matches(selector.path, path)) &&
    (!selector.pathNot || !matches(selector.pathNot, path))
  );
}

/**
 * @param {string} importer
 * @param {string} target
 */
function checkEdge(importer, target) {
  const from = policyPath(importer);
  const to = policyPath(target);
  for (const rule of forbidden) {
    assert.ok(
      !applies(rule.from, from) || !applies(rule.to, to),
      `${importer} -> ${target} violates ${rule.name}`,
    );
  }
}

/**
 * @param {string} path
 * @returns {{ directory: string, name: string }}
 */
function owner(path) {
  for (
    let directory = nodePath.dirname(path);
    ;
    directory = nodePath.dirname(directory)
  ) {
    const manifest = nodePath.join(directory, "package.json");
    if (existsSync(manifest)) {
      const name = optionalText(readJsonRecord(manifest), "name");
      if (name) return { directory, name };
    }
    assert.notEqual(
      directory,
      nodePath.dirname(directory),
      `${path} has no package owner`,
    );
  }
}

/**
 * @param {string} value
 * @param {string} importer
 * @param {boolean} runtime
 * @param {boolean} esm
 */
function checkPackage(value, importer, runtime, esm) {
  assert.ok(
    /^(?:node:[\w/-]+|(?:@[\w.-]+\/)?[\w-][\w.-]*(?:\/[\w.-]+)*)$/.test(
      value,
    ) &&
      !value.split("/").some((part) => part === "." || part === "..") &&
      !/^@antelopejs\/dms(?:\/|$)/.test(value),
    `${importer} imports must use another package specifier: ${value}`,
  );
  assert.ok(
    ![
      "process",
      "node:process",
      "worker_threads",
      "node:worker_threads",
    ].includes(value) &&
      (!["child_process", "node:child_process"].includes(value) ||
        Object.keys(processPins).some((key) =>
          key.startsWith(
            `${nodePath.relative(root, importer).split(sep).join("/")}:`,
          ),
        )),
    `${importer} builtin loader imports are forbidden: ${value}`,
  );
  if (isBuiltin(value)) return;
  let target;
  try {
    target = resolveRuntime(value, importer, esm);
  } catch (error) {
    assert.ok(
      !runtime,
      `${importer} cannot resolve runtime package ${value}: ${error.message}`,
    );
    target = ts.resolveModuleName(
      value,
      importer,
      {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        resolveJsonModule: true,
      },
      ts.sys,
    ).resolvedModule?.resolvedFileName;
  }
  assert.ok(target, `${importer} cannot resolve package ${value}`);
  target = realpathSync(target);
  const requested = value.startsWith("@")
    ? value.split("/").slice(0, 2).join("/")
    : value.split("/")[0];
  const actual = owner(target);
  assert.equal(
    requested,
    actual.name,
    `${importer} package ${value} resolves to another package owner: ${target}`,
  );
  if (target.startsWith(nodePath.join(workspace, "packages") + sep)) {
    assert.equal(
      realpathSync(
        resolveRuntime(
          value,
          nodePath.join(actual.directory, "package.json"),
          esm,
        ),
      ),
      target,
      `${importer} in-repo targets must use their own public package specifier: ${value}`,
    );
  }
  checkEdge(importer, target);
}

/**
 * @param {string} value
 * @param {string} path
 * @param {string} boundary
 * @param {boolean} compiled
 * @param {{ runtime: boolean, esm: boolean }} flags
 */
module.exports = function checkTarget(
  value,
  path,
  boundary,
  compiled,
  { runtime, esm },
) {
  if (!value.startsWith(".")) {
    checkPackage(value, path, compiled || runtime || esm, esm);
    return;
  }
  let target;
  let importer = path;
  if (!compiled && runtime && /\.[cm]?tsx?$/.test(path)) {
    assert.ok(
      (nodePath.resolve(nodePath.dirname(path), value) + sep).startsWith(
        boundary + sep,
      ),
      `${path} relative imports must resolve inside backend src: ${value}`,
    );
    importer = nodePath
      .join(root, "dist", nodePath.relative(nodePath.join(root, "src"), path))
      .replace(/\.(c|m)?tsx?$/, ".$1js");
    boundary = nodePath.join(root, "dist");
  }
  if (compiled || runtime) {
    try {
      target = resolveRuntime(value, importer, esm);
      if (/\.d\.[cm]?ts$/.test(target)) target = undefined;
    } catch {
      target = undefined;
    }
  } else {
    target = ts.resolveModuleName(
      value,
      path,
      {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowJs: true,
        resolveJsonModule: true,
      },
      ts.sys,
    ).resolvedModule?.resolvedFileName;
  }
  assert.ok(
    target &&
      (realpathSync(target) + sep).startsWith(realpathSync(boundary) + sep),
    `${path} relative imports must resolve inside backend ${nodePath.basename(boundary)}; use package exports for other packages: ${value}`,
  );
  checkEdge(path, target);
};

module.exports.checkCapabilities = checkCapabilities;
module.exports.checkEdge = checkEdge;
