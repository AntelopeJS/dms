import { spawnSync } from "node:child_process";
import {
  cpSync,
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

const packageRoot = nodePath.resolve(import.meta.dirname, "../..");
const repoRoot = nodePath.resolve(packageRoot, "../..");
const localeSegments = [
  "frontend-vue",
  "layers",
  "dms-core",
  "i18n",
  "locales",
];
const locales = ["core-en-GB.json", "core-fr-FR.json"];
const localeFile = z
  .object({ error: z.record(z.string(), z.unknown()) })
  .passthrough();

/**
 * Recreate `source` under `target` entry by entry as symlinks, except the path
 * `segments`, whose last directory is left for the caller to fill.
 * @param {string} source
 * @param {string} target
 * @param {readonly string[]} segments
 * @returns {void}
 */
function mirror(source, target, segments) {
  mkdirSync(target, { recursive: true });
  const [head, ...rest] = segments;
  for (const entry of readdirSync(source)) {
    const from = nodePath.join(source, entry);
    const to = nodePath.join(target, entry);
    if (entry !== head) symlinkSync(from, to);
    else if (rest.length > 0) mirror(from, to, rest);
    else mkdirSync(to);
  }
}

/** @typedef {z.infer<typeof localeFile>} LocaleFile */

/**
 * Run a copy of `backend-checks.cjs` in a package tree whose locale files are
 * the real ones after `edit`.
 * @param {(messages: LocaleFile) => void} edit
 * @returns {{ status: number | null, stderr: string, stdout: string }}
 */
export function runWithLocales(edit) {
  const workspace = mkdtempSync(nodePath.join(tmpdir(), "backend-checks-"));
  try {
    const tree = nodePath.join(workspace, "packages", "dms");
    mirror(repoRoot, workspace, ["packages", "dms", ...localeSegments]);
    rmSync(nodePath.join(tree, "scripts"));
    cpSync(
      nodePath.join(packageRoot, "scripts"),
      nodePath.join(tree, "scripts"),
      {
        recursive: true,
      },
    );
    const realLocales = nodePath.join(packageRoot, ...localeSegments);
    for (const file of locales) {
      const messages = localeFile.parse(
        JSON.parse(readFileSync(nodePath.join(realLocales, file), "utf8")),
      );
      edit(messages);
      writeFileSync(
        nodePath.join(tree, ...localeSegments, file),
        JSON.stringify(messages),
      );
    }
    return spawnSync(
      process.execPath,
      [nodePath.join(tree, "scripts", "backend-checks.cjs")],
      { cwd: tree, encoding: "utf8" },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
