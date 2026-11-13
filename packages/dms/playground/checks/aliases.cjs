const { readdirSync, readFileSync } = require("node:fs");
const nodePath = require("node:path");
const { z } = require("zod");
const {
  root,
  client,
  skippedDirectories,
  codeExtensions,
  failures,
} = require("./aliases-context.cjs");
const { checkScript } = require("./aliases-scripts.cjs");
const { checkVue } = require("./aliases-vue.cjs");

const trustedManifests = new Map([
  [
    nodePath.join(root, "package.json"),
    new Set([
      "name",
      "version",
      "private",
      "main",
      "dmsFrontend",
      "packageManager",
      "scripts",
      "devDependencies",
      "antelopeJs",
      "dmsFrontend",
      "dependencies",
    ]),
  ],
  [
    nodePath.join(client, "package.json"),
    new Set(["name", "version", "private", "type", "main", "engines"]),
  ],
]);

/** @param {string} path */
function checkManifest(path) {
  const fields = trustedManifests.get(path);
  if (!fields) {
    failures.push(
      `${path}: additional playground package metadata is forbidden`,
    );
    return;
  }
  const manifest = z.unknown().parse(JSON.parse(readFileSync(path, "utf8")));
  if (manifest === null || manifest === undefined)
    throw new TypeError(`${path}: playground package manifest is null`);
  for (const field of Object.keys(manifest))
    if (!fields.has(field))
      failures.push(`${path}: unsupported playground package field ${field}`);
}

/** @param {string} directory */
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = nodePath.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push(`${path}: playground source symlinks are forbidden`);
    } else if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        checkDirectory(path);
      }
    } else if (entry.name === "package.json") {
      checkManifest(path);
    } else if (entry.name.endsWith(".css")) {
      failures.push(`${path}: playground CSS files are forbidden`);
    } else if (entry.name.endsWith(".vue")) {
      checkVue(path);
    } else if (codeExtensions.has(nodePath.extname(entry.name))) {
      checkScript(readFileSync(path, "utf8"), path);
    }
  }
}

checkManifest(nodePath.join(root, "package.json"));
checkDirectory(nodePath.join(root, "src"));
checkDirectory(nodePath.join(root, "frontend-vue"));
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Playground import checks passed.\n");
}
