import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { parseJsonRecord, readJsonRecord } from "./json-record.mjs";

const helpersDir = import.meta.dirname;
const scriptsDir = nodePath.resolve(helpersDir, "..");
const packageRoot = nodePath.resolve(scriptsDir, "..");
const installed = nodePath.join(packageRoot, "node_modules");

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isWidth(value) {
  return typeof value === "number";
}

/**
 * A scratch package root that holds a copy of `script` and resolves the
 * packages in `linked` from the real install.
 * @param {string} script
 * @param {readonly string[]} linked
 * @returns {string}
 */
function scratchRoot(script, linked) {
  const root = mkdtempSync(nodePath.join(tmpdir(), "docs-scripts-"));
  for (const directory of ["scripts", "docs-data", "node_modules"])
    mkdirSync(nodePath.join(root, directory));
  cpSync(
    nodePath.join(scriptsDir, script),
    nodePath.join(root, "scripts", script),
  );
  for (const name of linked)
    symlinkSync(
      nodePath.join(installed, name),
      nodePath.join(root, "node_modules", name),
    );
  return root;
}

/**
 * @param {string} root
 * @param {readonly string[]} args
 */
function run(root, args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

/**
 * The entries of `manifest` named `version`, as the `dmsVersion` entries that
 * docs-catalog.mjs writes for them.
 * @param {Record<string, unknown>} manifest
 * @returns {[string, unknown][]}
 */
function expectedVersion(manifest) {
  return Object.entries(manifest)
    .filter(([key]) => key === "version")
    .map(([, value]) => ["dmsVersion", value]);
}

/**
 * The pages that document `types` one by one: each holds the playground and
 * the options table of its block type.
 * @param {readonly string[]} types
 * @returns {Map<string, string>}
 */
function pagesFor(types) {
  return new Map(
    types.map((type) => [
      `docs/${type}.md`,
      `# ${type}\n\n::block-playground{type="${type}" height="200"}\n\n::block-options{type="${type}"}\n`,
    ]),
  );
}

/**
 * @param {string} root
 * @param {ReadonlyMap<string, string>} pages
 */
function writePages(root, pages) {
  for (const [path, content] of pages) {
    const full = nodePath.join(root, path);
    mkdirSync(nodePath.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

/**
 * @param {string} catalogPath
 * @returns {string[]}
 */
function catalogTypes(catalogPath) {
  const { blocks } = readJsonRecord(catalogPath);
  if (!Array.isArray(blocks)) throw new TypeError("blocks is not an array");
  return blocks.map(({ type }) => String(type));
}

/**
 * Generate the catalogue in a scratch package root, write the pages that
 * document each of its block types, let `edit` change those pages, and run the
 * check. `types` lists the catalogue's block types.
 * @param {(pages: Map<string, string>, types: readonly string[]) => void} edit
 */
export function checkPages(edit) {
  const root = scratchRoot("docs-catalog.mjs", ["@antelopejs"]);
  try {
    writeFileSync(
      nodePath.join(root, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    const generate = run(root, ["scripts/docs-catalog.mjs"]);
    const types = catalogTypes(nodePath.join(root, "docs-data", "blocks.json"));
    const pages = pagesFor(types);
    edit(pages, types);
    writePages(root, pages);
    const check = run(root, ["scripts/docs-catalog.mjs", "--check"]);
    return { generate, check, types };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Generate the docs catalogue in a package root whose package.json is the real
 * one after `edit`, then check the generated file against the same script.
 * The real package.json is read as docs-catalog.mjs reads it, as plain parsed
 * JSON, so any `version` a contributor commits reaches the script.
 * `dmsVersion` holds the entries of the generated file named `dmsVersion`, so
 * a missing key and a null value stay apart, and `shipped` the entries that
 * the package.json written to the scratch root asks for.
 * @param {(manifest: Record<string, unknown>) => void} edit
 */
export function generateCatalog(edit) {
  const root = scratchRoot("docs-catalog.mjs", ["@antelopejs"]);
  try {
    const manifest = readJsonRecord(nodePath.join(packageRoot, "package.json"));
    edit(manifest);
    const written = nodePath.join(root, "package.json");
    writeFileSync(written, JSON.stringify(manifest));
    const generate = run(root, ["scripts/docs-catalog.mjs"]);
    const catalogPath = nodePath.join(root, "docs-data", "blocks.json");
    const generated = existsSync(catalogPath)
      ? readJsonRecord(catalogPath)
      : {};
    writePages(
      root,
      pagesFor(catalogTypes(nodePath.join(root, "docs-data", "blocks.json"))),
    );
    const check = run(root, ["scripts/docs-catalog.mjs", "--check"]);
    return {
      generate,
      check,
      dmsVersion: Object.entries(generated).filter(
        ([key]) => key === "dmsVersion",
      ),
      shipped: expectedVersion(readJsonRecord(written)),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Run docs-screenshots.mjs on `examples` (JSON text) for the ids in `only`,
 * against a browser whose preview page renders every block. Reports the exit
 * status, the files written and the viewport widths the script asked for.
 * @param {string} examples
 * @param {string} only
 * @param {readonly string[]} [extra] more arguments for the script
 */
export function captureExamples(examples, only, extra = []) {
  const root = scratchRoot("docs-screenshots.mjs", []);
  try {
    const playwright = nodePath.join(root, "node_modules", "playwright-core");
    mkdirSync(playwright);
    writeFileSync(
      nodePath.join(playwright, "package.json"),
      JSON.stringify({
        name: "playwright-core",
        type: "module",
        exports: "./index.js",
      }),
    );
    cpSync(
      nodePath.join(helpersDir, "fake-playwright.mjs"),
      nodePath.join(playwright, "index.js"),
    );
    writeFileSync(nodePath.join(root, "docs-data", "examples.json"), examples);
    const { status } = run(root, [
      "scripts/docs-screenshots.mjs",
      "--base-url",
      "http://preview.invalid",
      "--only",
      only,
      ...extra,
    ]);
    const shotsDir = nodePath.join(root, "docs", "images", "blocks");
    const logPath = nodePath.join(root, "fake-browser.log");
    const entries = existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => parseJsonRecord(line, logPath))
      : [];
    return {
      status,
      shots: existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [],
      widths: entries.flatMap(({ width }) => (isWidth(width) ? [width] : [])),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
