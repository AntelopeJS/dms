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
import { z } from "zod";

const helpersDir = import.meta.dirname;
const scriptsDir = nodePath.resolve(helpersDir, "..");
const packageRoot = nodePath.resolve(scriptsDir, "..");
const installed = nodePath.join(packageRoot, "node_modules");
const record = z.record(z.string(), z.unknown());
const logEntry = z.object({
  width: z.number().optional(),
  url: z.string().optional(),
});

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

/** The `version` of the real package.json. */
export const shippedVersion = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(nodePath.join(packageRoot, "package.json"), "utf8"),
    ),
  ).version;

/**
 * Generate the docs catalogue in a package root whose package.json is the real
 * one after `edit`, then check the generated file against the same script.
 * `dmsVersion` holds the entries of the generated file named `dmsVersion`, so
 * a missing key and a null value stay apart.
 * @param {(manifest: Record<string, unknown>) => void} edit
 */
export function generateCatalog(edit) {
  const root = scratchRoot("docs-catalog.mjs", ["@antelopejs"]);
  try {
    const manifest = record.parse(
      JSON.parse(
        readFileSync(nodePath.join(packageRoot, "package.json"), "utf8"),
      ),
    );
    edit(manifest);
    writeFileSync(
      nodePath.join(root, "package.json"),
      JSON.stringify(manifest),
    );
    const generate = run(root, ["scripts/docs-catalog.mjs"]);
    const catalogPath = nodePath.join(root, "docs-data", "blocks.json");
    const written = existsSync(catalogPath)
      ? record.parse(JSON.parse(readFileSync(catalogPath, "utf8")))
      : {};
    const check = run(root, ["scripts/docs-catalog.mjs", "--check"]);
    return {
      generate,
      check,
      dmsVersion: Object.entries(written).filter(
        ([key]) => key === "dmsVersion",
      ),
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
 */
export function captureExamples(examples, only) {
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
    const { status, stderr } = run(root, [
      "scripts/docs-screenshots.mjs",
      "--base-url",
      "http://preview.invalid",
      "--theme",
      "light",
      "--only",
      only,
    ]);
    const shotsDir = nodePath.join(root, "docs", "images", "blocks");
    const logPath = nodePath.join(root, "fake-browser.log");
    const entries = existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => logEntry.parse(JSON.parse(line)))
      : [];
    return {
      status,
      stderr,
      shots: existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [],
      widths: entries.flatMap(({ width }) =>
        width === undefined ? [] : [width],
      ),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
